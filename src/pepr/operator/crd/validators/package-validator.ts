/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";

import { Gateway, Protocol, UDSPackage } from "..";
import { generateVSName } from "../../controllers/istio/virtual-service";
import { generateMonitorName } from "../../controllers/monitoring/common";
import { generateName } from "../../controllers/network/generate";
import { PackageStore } from "../../controllers/packages/package-store";
import { sanitizeResourceName } from "../../controllers/utils";
import { Kind, Mode } from "../../crd/generated/package-v1alpha1";
import { migrate } from "../migrate";

const invalidNamespaces = ["kube-system", "kube-public", "_unknown_", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const pkg = migrate(req.Raw);

  const pkgName = pkg.metadata?.name ?? "_unknown_";
  const ns = pkg.metadata?.namespace ?? "_unknown_";
  const deletionTimestamp = pkg.metadata?.deletionTimestamp ?? null;

  if (invalidNamespaces.includes(ns)) {
    return req.Deny("invalid namespace");
  }

  // Check if a package already exists in the target namespace
  if (PackageStore.hasKey(ns) && !deletionTimestamp) {
    const existingPkgName = PackageStore.getPkgName(ns);
    // Since this function is called on admission, we need to allow updating existing packages
    if (existingPkgName !== pkgName) {
      return req.Deny(
        `A package with the name "${existingPkgName}" already exists in the namespace "${ns}". Only one package can exist in a namespace.`,
      );
    }
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
  const networkSpec = pkg.spec?.network;

  // Track the names of the network policies to ensure they are unique
  const networkPolicyNames = new Set<string>();

  for (const policy of networkPolicy) {
    // If 'remoteGenerated' is set, it cannot be combined with 'remoteNamespace', 'remoteSelector', 'remoteCidr', 'remoteHost', or 'remoteProtocol'.
    if (
      policy.remoteGenerated &&
      (policy.remoteNamespace ||
        policy.remoteSelector ||
        policy.remoteCidr ||
        policy.remoteHost ||
        policy.remoteProtocol)
    ) {
      return req.Deny(
        "remoteGenerated cannot be combined with remoteNamespace, remoteSelector, remoteCidr, remoteHost, or remoteProtocol",
      );
    }

    // If either 'remoteNamespace' or 'remoteSelector' is set, they cannot be combined with 'remoteGenerated', 'remoteCidr', 'remoteHost', or 'remoteProtocol'.
    if (
      (policy.remoteNamespace || policy.remoteSelector) &&
      (policy.remoteGenerated || policy.remoteCidr || policy.remoteHost || policy.remoteProtocol)
    ) {
      return req.Deny(
        "remoteNamespace and remoteSelector cannot be combined with remoteGenerated, remoteCidr, remoteHost, or remoteProtocol",
      );
    }

    // If 'remoteCidr' is set, it cannot be combined with 'remoteGenerated', 'remoteNamespace', 'remoteSelector', 'remoteHost', or 'remoteProtocol'.
    if (
      policy.remoteCidr &&
      (policy.remoteGenerated ||
        policy.remoteNamespace ||
        policy.remoteSelector ||
        policy.remoteHost ||
        policy.remoteProtocol)
    ) {
      return req.Deny(
        "remoteCidr cannot be combined with remoteGenerated, remoteNamespace, remoteSelector, remoteHost, or remoteProtocol",
      );
    }

    // If 'remoteHost' is set, it cannot be combined with 'remoteGenerated', 'remoteNamespace', 'remoteSelector', or 'remoteCidr'.
    if (
      policy.remoteHost &&
      (policy.remoteGenerated ||
        policy.remoteNamespace ||
        policy.remoteSelector ||
        policy.remoteCidr)
    ) {
      return req.Deny(
        "remoteHost cannot be combined with remoteGenerated, remoteNamespace, remoteSelector, or remoteCidr",
      );
    }

    // If 'remoteProtocol' is set, it cannot be combined with 'remoteGenerated', 'remoteNamespace', 'remoteSelector', or 'remoteCidr'and must have 'remoteHost'.
    if (
      policy.remoteProtocol &&
      (policy.remoteGenerated ||
        policy.remoteNamespace ||
        policy.remoteSelector ||
        policy.remoteCidr ||
        !policy.remoteHost)
    ) {
      return req.Deny(
        "remoteProtocol cannot be combined with remoteGenerated, remoteNamespace, remoteSelector, or remoteCidr and must have remoteHost",
      );
    }

    // The 'remoteHost' and 'remoteProtocol' cannot be used with 'Ingress'.
    if ((policy.remoteHost || policy.remoteProtocol) && policy.direction == "Ingress") {
      return req.Deny("remoteHost and/or remoteProtocol cannot be used with Ingress");
    }

    // The 'remoteHost' does not support wildcard domains.
    if (policy.remoteHost && policy.remoteHost.includes("*")) {
      return req.Deny("remoteHost does not support wildcard domains");
    }

    // Ambient is not compatible with 'remoteHost'.
    if (policy.remoteHost && networkSpec?.serviceMesh?.mode === Mode.Ambient) {
      return req.Deny("remoteHost not supported in ambient mode");
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

  const allowedClientAttributes = new Set([
    "oidc.ciba.grant.enabled",
    "backchannel.logout.session.required",
    "backchannel.logout.revoke.offline.tokens",
    "post.logout.redirect.uris",
    "oauth2.device.authorization.grant.enabled",
    "pkce.code.challenge.method",
    "client.session.idle.timeout",
    "client.session.max.lifespan",
    "access.token.lifespan",
    "saml.assertion.signature",
    "saml.client.signature",
    "saml_assertion_consumer_url_post",
    "saml_assertion_consumer_url_redirect",
    "saml_single_logout_service_url_post",
    "saml_single_logout_service_url_redirect",
    "saml_idp_initiated_sso_url_name",
    "use.refresh.tokens",
    "saml.encrypt",
    "saml_name_id_format",
    "saml.signing.certificate",
  ]);

  for (const client of ssoClients) {
    // Check for local uniqueness (within this package)
    if (clientIDs.has(client.clientId)) {
      return req.Deny(`The client ID "${client.clientId}" is not unique within this package`);
    }
    clientIDs.add(client.clientId);

    // Check for global uniqueness (across all packages/namespaces)
    const namespacesWithClientId = PackageStore.findPackagesWithSsoClientId(client.clientId);

    // If we find namespaces with this client ID, make sure it's only the current namespace being updated
    if (namespacesWithClientId.size > 0) {
      const isOwnedByCurrentPackage = namespacesWithClientId.has(ns);

      // If this client ID exists in other namespaces, deny the request
      if (!isOwnedByCurrentPackage) {
        return req.Deny(`The client ID "${client.clientId}" is already in use by another package.`);
      }
    }
    // Don't allow illegal k8s resource names for the secret name
    if (client.secretName && client.secretName !== sanitizeResourceName(client.secretName)) {
      return req.Deny(
        `The client ID "${client.clientId}" uses an invalid secret name ${client.secretName}`,
      );
    }
    // If standardFlowEnabled is undefined (defaults to `true`) or explicitly true and there are no redirectUris set, deny the req
    if (client.standardFlowEnabled !== false && !client.redirectUris) {
      return req.Deny(
        `The client ID "${client.clientId}" must specify redirectUris if standardFlowEnabled is turned on (it is enabled by default)`,
      );
    }
    // If serviceAccountsEnabled is true, do not allow standard flow
    if (client.serviceAccountsEnabled && client.standardFlowEnabled) {
      return req.Deny(
        `The client ID "${client.clientId}" serviceAccountsEnabled is disallowed with standardFlowEnabled`,
      );
    }
    // If this is a public client ensure that it only sets itself up as an OAuth Device Flow client
    if (
      client.publicClient &&
      (client.standardFlowEnabled !== false /* default true */ ||
        client.serviceAccountsEnabled /* default false */ ||
        client.secret !== undefined ||
        client.secretName !== undefined ||
        client.secretTemplate !== undefined ||
        client.enableAuthserviceSelector !== undefined ||
        client.protocol === Protocol.Saml ||
        client.attributes?.["oauth2.device.authorization.grant.enabled"] !== "true")
    ) {
      return req.Deny(
        `The client ID "${client.clientId}" sets options incompatible with publicClient`,
      );
    }
    // Check if client.attributes contain any disallowed attributes
    if (client.attributes) {
      for (const attr of Object.keys(client.attributes)) {
        if (!allowedClientAttributes.has(attr)) {
          return req.Deny(
            `The client ID "${client.clientId}" contains an unsupported attribute "${attr}"`,
          );
        }
      }
    }
    // If this is an authservice client ensure it does not contain a `:`, see https://github.com/istio-ecosystem/authservice/issues/263
    if (client.enableAuthserviceSelector && client.clientId.includes(":")) {
      return req.Deny(
        `The client ID "${client.clientId}" is invalid as an Authservice client - Authservice does not support client IDs with the ":" character`,
      );
    }
  }

  const monitors = pkg.spec?.monitor ?? [];

  // Ensure service and pod monitors use a unique description or selector/portName used for generating the resource name
  const podMonitorNames = new Set<string>();
  const svcMonitorNames = new Set<string>();

  for (const monitor of monitors) {
    const monitorName = generateMonitorName(pkgName, monitor);
    if (monitor.kind === Kind.PodMonitor) {
      if (podMonitorNames.has(monitorName)) {
        return req.Deny(
          `The combination of characteristics of this monitor entry would create a duplicate PodMonitor. ` +
            `Verify you do not have duplicate values, or add a unique "description" field for this monitor. ` +
            `The duplicate rule would be named "${monitorName}".`,
        );
      }
      podMonitorNames.add(monitorName);
    } else {
      if (svcMonitorNames.has(monitorName)) {
        return req.Deny(
          `The combination of characteristics of this monitor entry would create a duplicate ServiceMonitor. ` +
            `Verify you do not have duplicate values, or add a unique "description" field for this monitor. ` +
            `The duplicate rule would be named "${monitorName}".`,
        );
      }
      svcMonitorNames.add(monitorName);
    }
  }

  return req.Approve();
}
