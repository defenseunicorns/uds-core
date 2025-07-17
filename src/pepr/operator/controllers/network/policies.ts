/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { UDSConfig } from "../../../config";
import { Component, setupLogger } from "../../../logger";
import { Allow, Direction, Gateway, RemoteGenerated, UDSPackage } from "../../crd";
import { getPodSelector, getWaypointName, shouldUseAmbientWaypoint } from "../../utils/waypoint";
import { IstioState } from "../istio/namespace";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";
import { allowEgressDNS } from "./defaults/allow-egress-dns";
import { allowEgressIstiod } from "./defaults/allow-egress-istiod";
import { allowIngressSidecarMonitoring } from "./defaults/allow-ingress-sidecar-monitoring";
import { defaultDenyAll } from "./defaults/default-deny-all";
import { generate } from "./generate";
import { allowAmbientHealthprobes } from "./generators/ambientHealthprobes";

/**
 * Finds the SSO client that matches the given service selector
 */
export function findMatchingClient(pkg: UDSPackage, serviceSelector: Record<string, string>) {
  if (!serviceSelector) return undefined;

  return pkg.spec?.sso?.find(
    sso =>
      sso.enableAuthserviceSelector &&
      ((serviceSelector["app.kubernetes.io/name"] &&
        sso.enableAuthserviceSelector["app.kubernetes.io/name"] ===
          serviceSelector["app.kubernetes.io/name"]) ||
        (serviceSelector.app && sso.enableAuthserviceSelector.app === serviceSelector.app)),
  );
}

/**
 * Generates a safe description for network policies
 */
export function getPolicyDescription(
  port: number,
  clientId: string | undefined,
  gateway: string,
  isAmbient: boolean,
): string {
  if (isAmbient && clientId) {
    return `${port}-${clientId} Istio ${gateway} gateway (ambient)`;
  }
  return `${port}-service Istio ${gateway} gateway`;
}

// configure subproject logger
const log = setupLogger(Component.OPERATOR_NETWORK);

export async function networkPolicies(pkg: UDSPackage, namespace: string, istioMode: string) {
  const customPolicies = pkg.spec?.network?.allow ?? [];
  const pkgName = pkg.metadata!.name!;

  // Get the current generation of the package
  const generation = (pkg.metadata?.generation ?? 0).toString();

  log.debug(pkg.metadata, `Generating NetworkPolicies for generation ${generation}`);

  // Create default policies
  const policies = [
    // All traffic must be explicitly allowed
    defaultDenyAll(namespace),

    // Allow DNS lookups
    allowEgressDNS(namespace),
  ];

  // Istio rules for sidecars
  if (istioMode === IstioState.Sidecar) {
    policies.push(allowEgressIstiod(namespace));
    policies.push(allowIngressSidecarMonitoring(namespace));
  }

  // Istio rules for ambient mode
  if (istioMode === IstioState.Ambient) {
    policies.push(allowAmbientHealthprobes(namespace));
  }

  // Process custom policies
  for (const policy of customPolicies) {
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Generate NetworkPolicies for any VirtualServices that are generated
  const exposeList = pkg.spec?.network?.expose ?? [];
  // Iterate over each exposed service, excluding directResponse services
  for (const expose of exposeList.filter(exp => !exp.advancedHTTP?.directResponse)) {
    const { gateway = Gateway.Tenant, port = 80, selector = {}, targetPort } = expose;
    const policyPort = targetPort ?? port;

    // Find if this service has a matching client with waypoint
    const matchingClient = findMatchingClient(pkg, selector);
    const waypointName = matchingClient ? getWaypointName(matchingClient.clientId) : undefined;

    // Use waypoint selector only if we have a waypoint and the package is configured for ambient waypoint
    const podSelector =
      waypointName && shouldUseAmbientWaypoint(pkg)
        ? getPodSelector(pkg, selector, waypointName)
        : selector;

    // Create the NetworkPolicy for the VirtualService
    const policy: Allow = {
      direction: Direction.Ingress,
      // Use the waypoint selector if in ambient mode with a matching client
      selector: podSelector,
      remoteNamespace: `istio-${gateway}-gateway`,
      remoteSelector: {
        app: `${gateway}-ingressgateway`,
      },
      port: policyPort,
      description: getPolicyDescription(
        policyPort,
        matchingClient?.clientId || undefined,
        gateway,
        !!waypointName,
      ),
    };

    // Generate the policy
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Add network policies for each SSO client with authservice enabled
  const ssos = pkg.spec?.sso?.filter(sso => sso.enableAuthserviceSelector) || [];

  for (const sso of ssos) {
    const waypointName = getWaypointName(sso.clientId);
    const netpolSelector =
      shouldUseAmbientWaypoint(pkg)
        ? { "gateway.networking.k8s.io/gateway-name": waypointName }
        : sso.enableAuthserviceSelector;

    const policy: Allow = {
      direction: Direction.Egress,
      selector: netpolSelector,
      remoteNamespace: "authservice",
      remoteSelector: { "app.kubernetes.io/name": "authservice" },
      port: 10003,
      description: `${sanitizeResourceName(sso.clientId)} authservice egress`,
    };

    // Generate the workload to keycloak for JWKS endpoint policy
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);

    const keycloakPolicy: Allow = {
      direction: Direction.Egress,
      selector: netpolSelector,
      remoteNamespace: "keycloak",
      remoteSelector: { "app.kubernetes.io/name": "keycloak" },
      port: 8080,
      description: `${sso.clientId} keycloak JWKS egress`,
    };

    // Generate the policy
    const keycloakGeneratedPolicy = generate(namespace, keycloakPolicy);
    policies.push(keycloakGeneratedPolicy);

    // Ambient mode: add waypoint-to-istiod egress policy for this client's waypoint
    if (shouldUseAmbientWaypoint(pkg)) {
      const istiodPolicy = allowEgressIstiod(namespace);
      istiodPolicy.spec!.podSelector = { matchLabels: netpolSelector };
      istiodPolicy.metadata = istiodPolicy.metadata || {};
      istiodPolicy.metadata.labels = {
        ...istiodPolicy.metadata.labels,
        "uds/package": pkg.metadata!.name!,
        "uds/sso-client": sso.clientId,
      };
      policies.push(istiodPolicy);
    }
  }

  // Generate NetworkPolicies for any monitors that are generated
  const monitorList = pkg.spec?.monitor ?? [];
  // Iterate over each monitor
  for (const monitor of monitorList) {
    const { selector, targetPort, podSelector } = monitor;

    // Create the NetworkPolicy for the monitor
    const policy: Allow = {
      direction: Direction.Ingress,
      selector: podSelector ?? selector,
      remoteNamespace: "monitoring",
      remoteSelector: {
        app: "prometheus",
      },
      port: targetPort,
      // Use the targetPort and selector to generate a description for the monitoring derived policies
      description: `${targetPort}-${Object.values(selector)} Metrics`,
    };
    // Generate the policy
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Iterate over each policy and apply it
  for (const [idx, policy] of policies.entries()) {
    // Add the package name and generation to the labels
    policy.metadata = policy.metadata ?? {};
    policy.metadata.labels = policy.metadata?.labels ?? {};
    policy.metadata.labels["uds/package"] = pkgName;
    policy.metadata.labels["uds/generation"] = generation;

    // Add the package name to the name of the policy to ensure uniqueness
    if (idx < 1) {
      policy.metadata.name = `deny-${pkgName}-${policy.metadata.name}`;
    } else {
      policy.metadata.name = `allow-${pkgName}-${policy.metadata.name}`;
    }

    // Loop through all ports in ingress/egress policies and add port 15008 for ztunnel
    if (policy.spec?.ingress) {
      for (const ingress of policy.spec.ingress) {
        // Only add the port if there is a port restriction
        if (ingress.ports && ingress.ports.some(port => port.protocol !== "UDP")) {
          ingress.ports.push({ port: 15008 });
        }
      }
    } else if (policy.spec?.egress) {
      for (const egress of policy.spec.egress) {
        // Don't add port 15008 for egress destinations that we know are not in-mesh or not in-cluster
        if (
          policy.metadata?.labels?.["uds/generated"] === RemoteGenerated.KubeNodes ||
          policy.metadata?.labels?.["uds/generated"] === RemoteGenerated.KubeAPI ||
          policy.metadata?.labels?.["uds/generated"] === RemoteGenerated.CloudMetadata
        ) {
          continue;
        }
        // Only add the port if there is a port restriction
        if (egress.ports && egress.ports.some(port => port.protocol !== "UDP")) {
          egress.ports.push({ port: 15008 });
        }
      }
    }

    // Ensure the name is a valid resource name
    policy.metadata.name = sanitizeResourceName(policy.metadata.name);

    // Use the CR as the owner ref for each NetworkPolicy
    policy.metadata.ownerReferences = getOwnerRef(pkg);

    // Apply the NetworkPolicy and force overwrite any existing policy
    try {
      await K8s(kind.NetworkPolicy).Apply(policy, { force: true });
    } catch (err) {
      let message = err.data?.message || "Unknown error while applying network policies";
      if (
        UDSConfig.kubeApiCidr &&
        policy.metadata.labels["uds/generated"] === RemoteGenerated.KubeAPI
      ) {
        message +=
          ", ensure that the KUBEAPI_CIDR override configured for the operator is correct.";
      }
      if (
        UDSConfig.kubeNodeCidrs &&
        policy.metadata.labels["uds/generated"] === RemoteGenerated.KubeNodes
      ) {
        message +=
          ", ensure that the KUBENODE_CIDRS override configured for the operator is correct.";
      }
      throw new Error(message);
    }
  }

  await purgeOrphans(generation, namespace, pkgName, kind.NetworkPolicy, log);

  // Return the list of policies
  return policies;
}
