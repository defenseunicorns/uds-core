import { PeprValidateRequest } from "pepr";

import { Gateway, UDSPackage } from "..";
import { generateVSName } from "../../controllers/istio/virtual-service";
import { generateName } from "../../controllers/network/generate";
import { sanitizeResourceName } from "../../controllers/utils";
import { migrate } from "../migrate";

const invalidNamespaces = ["kube-system", "kube-public", "_unknown_", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const pkg = migrate(req.Raw);

  const pkgName = pkg.metadata?.name ?? "_unknown_";
  const ns = pkg.metadata?.namespace ?? "_unknown_";

  if (invalidNamespaces.includes(ns)) {
    return req.Deny("invalid namespace");
  }

  const exposeList = pkg.spec?.network?.expose ?? [];

  // Track the names of the virtual services to ensure they are unique
  const virtualServiceNames = new Set<string>();

  for (const expose of exposeList) {
    if (expose.gateway === Gateway.Passthrough) {
      if (expose.advancedHTTP) {
        return req.Deny("advancedHTTP cannot be used with passthrough gateway");
      }
    }

    // directResponse cannot be combined with service, port or pod configs
    if (
      expose.advancedHTTP?.directResponse &&
      (expose.service || expose.selector || expose.port || expose.targetPort)
    ) {
      return req.Deny("directResponse cannot be combined with service, port, selector, targetPort");
    }

    // Ensure the service name is unique
    const name = generateVSName(pkgName, expose);
    if (virtualServiceNames.has(name)) {
      return req.Deny(
        `The combination of characteristics of this expose entry would create a duplicate VirtualService. ` +
          `Verify you do not have duplicate values, or add a unique "description" field for this rule. ` +
          `The duplicate rule would be named "${name}".`,
      );
    }

    // Add the name to the set to track it
    virtualServiceNames.add(name);
  }

  const networkPolicy = pkg.spec?.network?.allow ?? [];

  // Track the names of the network policies to ensure they are unique
  const networkPolicyNames = new Set<string>();

  for (const policy of networkPolicy) {
    // remoteGenerated cannot be combined with remoteNamespace or remoteSelector
    if (policy.remoteGenerated && (policy.remoteNamespace || policy.remoteSelector)) {
      return req.Deny("remoteGenerated cannot be combined with remoteNamespace or remoteSelector");
    }

    // Ensure the policy name is unique
    const name = sanitizeResourceName(`allow-${pkg.metadata?.name}-${generateName(policy)}`);
    if (networkPolicyNames.has(name)) {
      return req.Deny(
        `The combination of characteristics of this network allow rule would create a duplicate NetworkPolicy. ` +
          `Verify you do not have duplicate allow rules, or add a unique "description" field for this rule. ` +
          `The duplicate rule would be named "${name}".`,
      );
    }
    // Add the name to the set to track it
    networkPolicyNames.add(name);
  }

  const ssoClients = pkg.spec?.sso ?? [];

  // Ensure the client IDs are unique
  const clientIDs = new Set<string>();

  for (const client of ssoClients) {
    if (clientIDs.has(client.clientId)) {
      return req.Deny(`The client ID "${client.clientId}" is not unique`);
    }
    clientIDs.add(client.clientId);
    // Don't allow illegal k8s resource names for the secret name
    if (client.secretName && client.secretName !== sanitizeResourceName(client.secretName)) {
      return req.Deny(
        `The client ID "${client.clientId}" uses an invalid secret name ${client.secretName}`,
      );
    }
    // If standardFlowEnabled is undefined (defaults to `true`) or explicitly true and there are no redirectUris set, deny the req
    if (
      (client.standardFlowEnabled === undefined || client.standardFlowEnabled) &&
      !client.redirectUris
    ) {
      return req.Deny(
        `The client ID "${client.clientId}" must specify redirectUris if standardFlowEnabled is turned on`,
      );
    }
    // If this is a public client ensure that it only sets itself up as an OAuth Device Flow client
    if (
      client.publicClient &&
      (
        (client.standardFlowEnabled === undefined || client.standardFlowEnabled) ||
        (client.secret) ||
        (client.secretName) ||
        (client.secretTemplate) ||
        (client.enableAuthserviceSelector) ||
        (client.protocol === "saml") ||
        (!client.attributes || client.attributes["oauth2.device.authorization.grant.enabled"] != "true")
      )
    ) {
      return req.Deny(
        `The client ID "${client.clientId}" must _only_ configure the OAuth Device Flow as a public client`,
      );
    }
  }

  return req.Approve();
}
