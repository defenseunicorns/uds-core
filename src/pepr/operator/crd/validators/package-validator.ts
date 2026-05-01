/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";

import { Direction, Gateway, Protocol, RemoteGenerated, RemoteProtocol, UDSPackage } from "..";
import { UDSConfig } from "../../controllers/config/config";
import { generateVSName } from "../../controllers/istio/virtual-service";
import { generateMonitorName } from "../../controllers/monitoring/common";
import { generateName } from "../../controllers/network/generate";
import { PackageStore } from "../../controllers/packages/package-store";
import { getFqdn } from "../../controllers/domain-utils";
import { sanitizeResourceName } from "../../controllers/utils";
import { Kind, Mode } from "../../crd/generated/package-v1alpha1";
import { migrate } from "../migrate";

const invalidNamespaces = ["kube-system", "kube-public", "_unknown_", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const pkg = migrate(req.Raw);

  const pkgName = pkg.metadata?.name ?? "_unknown_";
  const ns = pkg.metadata?.namespace ?? "_unknown_";
  const deletionTimestamp = pkg.metadata?.deletionTimestamp ?? null;
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;

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

  // Helper function to check if a gateway name is one of the standard gateways
  const isStandardGateway = (g: string): g is Gateway =>
    (Object.values(Gateway) as string[]).includes(g);

  const exposeList = pkg.spec?.network?.expose ?? [];

  // Track the names of the virtual services to ensure they are unique
  const virtualServiceNames = new Set<string>();
  // Track FQDNs for uptime probes to ensure no duplicates
  const uptimeFqdns = new Set<string>();

  for (const expose of exposeList) {
    // Validate gateway name format if it's a custom gateway
    if (expose.gateway && !isStandardGateway(expose.gateway)) {
      // Check if gateway name is a valid Kubernetes resource name
      const sanitizedName = sanitizeResourceName(expose.gateway);
      if (sanitizedName !== expose.gateway) {
        return req.Deny(
          `Gateway name "${expose.gateway}" is not a valid Kubernetes resource name. It should only contain lowercase alphanumeric characters, '-', or '.'`,
        );
      }
    }
    if (expose.gateway && isStandardGateway(expose.gateway) && expose.domain) {
      return req.Deny(
        "domain cannot be set for the standard gateways (tenant, admin, or passthrough)",
      );
    }

    if (expose.gateway === Gateway.Passthrough || expose.gateway?.includes("passthrough")) {
      if (expose.advancedHTTP) {
        return req.Deny("advancedHTTP cannot be used with a passthrough gateway");
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

    // Validate uptime probe configuration (paths presence enables uptime)
    if (expose.uptime?.checks?.paths?.length) {
      // Validate paths start with /
      for (const path of expose.uptime.checks.paths) {
        if (!path.startsWith("/")) {
          return req.Deny(`Uptime probe path "${path}" must start with "/"`);
        }
      }

      // Validate no duplicate FQDNs
      const fqdn = getFqdn(expose);
      if (uptimeFqdns.has(fqdn)) {
        return req.Deny(
          `Duplicate uptime probe for FQDN "${fqdn}". ` +
            `Only one expose entry per FQDN can have uptime checks configured.`,
        );
      }
      uptimeFqdns.add(fqdn);
    }
  }

  const networkPolicy = pkg.spec?.network?.allow ?? [];

  // Track the names of the network policies to ensure they are unique
  const networkPolicyNames = new Set<string>();

  for (const policy of networkPolicy) {
    // TLS/HTTP drive Istio ServiceEntry generation; TCP/UDP set NetworkPolicy port protocol.
    const isL7Protocol =
      policy.remoteProtocol === RemoteProtocol.TLS || policy.remoteProtocol === RemoteProtocol.HTTP;

    // Every allow rule must specify at least one explicit remote target.
    // Note: remoteNamespace uses === undefined because "" is a valid wildcard meaning "any namespace in cluster".
    if (
      !policy.remoteGenerated &&
      policy.remoteNamespace === undefined &&
      !policy.remoteSelector &&
      !policy.remoteCidr &&
      !policy.remoteHost
    ) {
      return req.Deny(
        "network allow rules must specify a remote: remoteGenerated, remoteNamespace, remoteSelector, remoteCidr, or remoteHost",
      );
    }

    // remoteGenerated cannot combine with namespace/selector/cidr/host or L7 protocols.
    // TCP/UDP are permitted with remoteGenerated (except KubeAPI/KubeNodes/CloudMetadata for UDP).
    if (
      policy.remoteGenerated &&
      (policy.remoteNamespace !== undefined ||
        policy.remoteSelector ||
        policy.remoteCidr ||
        policy.remoteHost ||
        isL7Protocol)
    ) {
      return req.Deny(
        "remoteGenerated cannot be combined with remoteNamespace, remoteSelector, remoteCidr, remoteHost, or TLS/HTTP remoteProtocol",
      );
    }

    // remoteNamespace/remoteSelector cannot combine with remoteGenerated/cidr/host or L7 protocols.
    // TCP/UDP are permitted with remoteNamespace/remoteSelector to set NetworkPolicy port protocol.
    if (
      (policy.remoteNamespace !== undefined || policy.remoteSelector) &&
      (policy.remoteGenerated || policy.remoteCidr || policy.remoteHost || isL7Protocol)
    ) {
      return req.Deny(
        "remoteNamespace and remoteSelector cannot be combined with remoteGenerated, remoteCidr, remoteHost, or TLS/HTTP remoteProtocol",
      );
    }

    // remoteCidr cannot combine with remoteGenerated/ns/selector/host or L7 protocols.
    // TCP/UDP are permitted with remoteCidr to set NetworkPolicy port protocol.
    if (
      policy.remoteCidr &&
      (policy.remoteGenerated ||
        policy.remoteNamespace !== undefined ||
        policy.remoteSelector ||
        policy.remoteHost ||
        isL7Protocol)
    ) {
      return req.Deny(
        "remoteCidr cannot be combined with remoteGenerated, remoteNamespace, remoteSelector, remoteHost, or TLS/HTTP remoteProtocol",
      );
    }

    // KubeAPI, KubeNodes, and CloudMetadata are TCP-only endpoints; UDP cannot reach them.
    if (
      policy.remoteProtocol === RemoteProtocol.UDP &&
      (policy.remoteGenerated === RemoteGenerated.KubeAPI ||
        policy.remoteGenerated === RemoteGenerated.KubeNodes ||
        policy.remoteGenerated === RemoteGenerated.CloudMetadata)
    ) {
      return req.Deny(
        `UDP remoteProtocol cannot be combined with remoteGenerated KubeAPI, KubeNodes, or CloudMetadata (these endpoints are TCP-only); got: ${policy.remoteGenerated}`,
      );
    }

    // Istio ServiceEntry does not support UDP; use remoteNamespace/remoteSelector/remoteCidr instead.
    if (policy.remoteProtocol === RemoteProtocol.UDP && policy.remoteHost) {
      return req.Deny(
        "UDP remoteProtocol cannot be combined with remoteHost (Istio ServiceEntry does not support UDP)",
      );
    }

    // remoteHost and L7 protocols are Egress-only (they drive Istio ServiceEntry generation).
    // TCP/UDP are valid on Ingress to set the NetworkPolicy port protocol.
    if ((policy.remoteHost || isL7Protocol) && policy.direction === Direction.Ingress) {
      return req.Deny(
        "remoteHost and TLS/HTTP remoteProtocol cannot be combined with Ingress direction",
      );
    }

    // Without ports, TCP/UDP remoteProtocol silently broadens the policy (all ports allowed, no protocol filter applied).
    if (
      (policy.remoteProtocol === RemoteProtocol.TCP ||
        policy.remoteProtocol === RemoteProtocol.UDP) &&
      policy.port === undefined &&
      !policy.ports?.length
    ) {
      return req.Deny("TCP/UDP remoteProtocol requires at least one port or ports entry");
    }

    // The 'remoteHost' does not support wildcard domains.
    if (policy.remoteHost && policy.remoteHost.includes("*")) {
      return req.Deny("remoteHost does not support wildcard domains");
    }

    // The 'serviceAccount' is allowed in Ambient mode when:
    //  - remoteHost is specified, or
    //  - remoteGenerated: Anywhere on Egress rules
    if (policy.serviceAccount) {
      const isAmbient = istioMode === Mode.Ambient;
      const hostAllowed = isAmbient && !!policy.remoteHost;
      const anywhereAllowed =
        isAmbient &&
        policy.remoteGenerated === RemoteGenerated.Anywhere &&
        policy.direction === Direction.Egress;
      if (!hostAllowed && !anywhereAllowed) {
        return req.Deny(
          "serviceAccount is only valid for Ambient mode when using remoteHost or remoteGenerated: Anywhere on Egress rules",
        );
      }
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
    "access.token.lifespan",
    "backchannel.logout.revoke.offline.tokens",
    "backchannel.logout.session.required",
    "client.session.idle.timeout",
    "client.session.max.lifespan",
    "logout.confirmation.enabled",
    "oauth2.device.authorization.grant.enabled",
    "oidc.ciba.grant.enabled",
    "pkce.code.challenge.method",
    "post.logout.redirect.uris",
    "saml.assertion.signature",
    "saml.client.signature",
    "saml.encrypt",
    "saml.signing.certificate",
    "saml_assertion_consumer_url_post",
    "saml_assertion_consumer_url_redirect",
    "saml_idp_initiated_sso_url_name",
    "saml_name_id_format",
    "saml_single_logout_service_url_post",
    "saml_single_logout_service_url_redirect",
    "use.refresh.tokens",
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
    if (
      client.secretConfig?.name &&
      client.secretConfig.name !== sanitizeResourceName(client.secretConfig.name)
    ) {
      return req.Deny(
        `The client ID "${client.clientId}" uses an invalid secret name ${client.secretConfig.name}`,
      );
    }
    // If standardFlowEnabled is undefined (defaults to `true`) or explicitly true and there are no redirectUris set, deny the req
    if (client.standardFlowEnabled !== false && !client.redirectUris?.length) {
      return req.Deny(
        `The client ID "${client.clientId}" must specify redirectUris if standardFlowEnabled is turned on (it is enabled by default)`,
      );
    }

    // Public client admission. Two shapes are allowed:
    //   1. Device-flow-only (always accepted): standardFlowEnabled=false AND
    //      oauth2.device.authorization.grant.enabled="true". PKCE does not apply to RFC 8628.
    //   2. Other flows (gated by UDSConfig.allowPublicClients): require
    //      pkce.code.challenge.method="S256" (exact, case-sensitive per RFC 7636)
    //      and forbid option combinations that either make no sense for a public
    //      client or expand its attack surface. "plain" is rejected because it
    //      transmits the challenge equal to the verifier and does not mitigate
    //      authorization-code interception.
    if (client.publicClient) {
      const isDeviceFlowOnly =
        client.standardFlowEnabled === false &&
        client.attributes?.["oauth2.device.authorization.grant.enabled"] === "true";

      if (!isDeviceFlowOnly) {
        if (!UDSConfig.allowPublicClients) {
          return req.Deny(
            `The client ID "${client.clientId}" is a public client. Non-device-flow ` +
              `public clients are disabled by default. Set ALLOW_PUBLIC_CLIENTS="true" ` +
              `in the uds-operator-config Secret to enable them.`,
          );
        }
        // SAML public clients: PKCE is an OAuth 2.0 concept (RFC 7636) and does nothing
        // on a SAML client, so we cannot rely on it as a mitigation.
        if (client.protocol === Protocol.Saml) {
          return req.Deny(
            `The client ID "${client.clientId}" cannot be a SAML public client. PKCE does not apply to SAML.`,
          );
        }
        if (client.serviceAccountsEnabled) {
          return req.Deny(
            `The client ID "${client.clientId}" is a public client and cannot set serviceAccountsEnabled`,
          );
        }
        if (
          client.secret !== undefined ||
          client.secretConfig?.name !== undefined ||
          client.secretConfig?.template !== undefined
        ) {
          return req.Deny(
            `The client ID "${client.clientId}" is a public client and cannot set secret or secretConfig`,
          );
        }
        if (client.enableAuthserviceSelector !== undefined) {
          return req.Deny(
            `The client ID "${client.clientId}" is a public client and cannot set enableAuthserviceSelector`,
          );
        }
        // PKCE must be enabled and pinned to "S256" (exact, case-sensitive per
        // RFC 7636). "plain" is rejected: it sends the challenge equal to the
        // verifier on the wire, so a stolen authorization code can be redeemed
        // directly, defeating the purpose of PKCE. App owners whose clients
        // cannot emit S256 must be created outside the operator (Admin API or
        // OpenTofu) as a conscious, out-of-band decision.
        const pkceMethod = client.attributes?.["pkce.code.challenge.method"];
        if (pkceMethod !== "S256") {
          return req.Deny(
            `The client ID "${client.clientId}" is a public client and must set ` +
              `"pkce.code.challenge.method" to "S256" (RFC 7636, case-sensitive).`,
          );
        }
      }

      // Device-flow-only public clients retain the original hygiene rules: no standard
      // flow, no serviceAccountsEnabled, no secret, no authservice, OIDC only.
      if (
        isDeviceFlowOnly &&
        (client.serviceAccountsEnabled ||
          client.secret !== undefined ||
          client.secretConfig?.name !== undefined ||
          client.secretConfig?.template !== undefined ||
          client.enableAuthserviceSelector !== undefined ||
          client.protocol === Protocol.Saml)
      ) {
        return req.Deny(
          `The client ID "${client.clientId}" sets options incompatible with publicClient`,
        );
      }
    }
    // If serviceAccountsEnabled is true on a non-public client, do not allow standard flow
    if (!client.publicClient && client.serviceAccountsEnabled && client.standardFlowEnabled) {
      return req.Deny(
        `The client ID "${client.clientId}" serviceAccountsEnabled is disallowed with standardFlowEnabled`,
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

    // If this is an authservice client, deny redirectUris that contain any root paths
    if (client.enableAuthserviceSelector && client.redirectUris?.length) {
      for (const uri of client.redirectUris) {
        let url: URL;
        try {
          url = new URL(uri);
        } catch {
          return req.Deny(
            `The client ID "${client.clientId}" has an invalid redirect URI "${uri}". Redirect URIs must be valid URLs.`,
          );
        }

        const path = url.pathname;
        if (path === "/") {
          return req.Deny(
            `The client ID "${client.clientId}" has redirectUris containing root paths ("/"). Authservice clients cannot have root path redirect URIs.`,
          );
        }
      }
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
