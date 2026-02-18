/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { Allow, Direction, Gateway, RemoteGenerated, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { UDSConfig } from "../config/config";
import { getPodSelector, getWaypointName, shouldUseAmbientWaypoint } from "../istio/waypoint-utils";
import {
  getAuthserviceClients,
  getOwnerRef,
  purgeOrphans,
  retryWithDelay,
  sanitizeResourceName,
} from "../utils";
import { allowEgressDNS } from "./defaults/allow-egress-dns";
import { allowEgressIstiod } from "./defaults/allow-egress-istiod";
import { allowIngressSidecarMonitoring } from "./defaults/allow-ingress-sidecar-monitoring";
import { defaultDenyAll } from "./defaults/default-deny-all";
import { generate } from "./generate";
import { allowAmbientHealthprobes } from "./generators/ambientHealthprobes";

/**
 * Finds an SSO client that matches the given pod labels.
 * - If the selector is an empty object ({}), it matches all pods in the namespace.
 * - If the client has a selector, it matches only pods with all the specified labels
 */
export function findMatchingClient(pkg: UDSPackage, podLabels: Record<string, string>) {
  const authserviceClients = getAuthserviceClients(pkg);

  if (!podLabels || authserviceClients.length === 0) return undefined;

  return authserviceClients.find(sso => {
    const selector = sso.enableAuthserviceSelector;

    // If the selector is empty, it matches all pods in the namespace
    if (Object.keys(selector!).length === 0) {
      return true;
    }

    // Otherwise, check that every label in the selector exists and matches in podLabels
    return Object.entries(selector!).every(
      ([key, value]) => key in podLabels && podLabels[key] === value,
    );
  });
}

// configure subproject logger
const log = setupLogger(Component.OPERATOR_NETWORK);

// @lulaStart cd540e07-153b-424c-90e0-c0daec56b16a
// @lulaStart cd540e07-153b-424c-90e0-c0daec56b18f
// @lulaStart a9d420a8-1ad2-479f-a438-aa4ca0f57473
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
  if (istioMode === Mode.Sidecar) {
    policies.push(allowEgressIstiod(namespace));
    policies.push(allowIngressSidecarMonitoring(namespace));
  }

  // Istio rules for ambient mode
  if (istioMode === Mode.Ambient) {
    policies.push(allowAmbientHealthprobes(namespace));
  }

  // Process custom policies
  for (const policy of customPolicies) {
    // Only process ingress policies that have a selector
    if (policy.direction === Direction.Ingress && policy.selector) {
      // Find if this policy's selector matches an authservice-protected workload
      const matchingClient = findMatchingClient(pkg, policy.selector);
      const waypointName = matchingClient ? getWaypointName(matchingClient.clientId) : undefined;

      // If we found a matching client with a waypoint, update the selector
      if (waypointName) {
        policy.selector = getPodSelector(pkg, policy.selector, waypointName);
      }
    }

    const generatedPolicy = generate(namespace, policy, istioMode as Mode);
    policies.push(generatedPolicy);
  }

  // Generate NetworkPolicies for any VirtualServices that are generated
  const exposeList = pkg.spec?.network?.expose ?? [];
  // Iterate over each exposed service, excluding directResponse services
  for (const expose of exposeList.filter(exp => !exp.advancedHTTP?.directResponse)) {
    const { gateway = Gateway.Tenant, port, selector = {}, targetPort } = expose;
    const policyPort = targetPort ?? port;

    // Find if this service has a matching client with waypoint
    const matchingClient = findMatchingClient(pkg, selector);
    const waypointName = matchingClient ? getWaypointName(matchingClient.clientId) : undefined;

    // Use waypoint selector only if we have a waypoint and the package is configured for ambient waypoint
    const podSelector = waypointName ? getPodSelector(pkg, selector, waypointName) : selector;

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
      description: `${policyPort}-${Object.values(selector).join("-")} Istio ${gateway} gateway`,
    };

    // Generate the policy
    const generatedPolicy = generate(namespace, policy, istioMode as Mode);
    policies.push(generatedPolicy);
  }

  // Add network policies for each SSO client with authservice enabled
  const ssos = getAuthserviceClients(pkg);

  for (const sso of ssos) {
    const waypointName = getWaypointName(sso.clientId);
    const netpolSelector = getPodSelector(pkg, sso.enableAuthserviceSelector!, waypointName);

    const policy: Allow = {
      direction: Direction.Egress,
      selector: netpolSelector,
      remoteNamespace: "authservice",
      remoteSelector: { "app.kubernetes.io/name": "authservice" },
      port: 10003,
      description: `${sanitizeResourceName(sso.clientId)} authservice egress`,
    };

    // Generate the workload to keycloak for JWKS endpoint policy
    const generatedPolicy = generate(namespace, policy, istioMode as Mode);
    policies.push(generatedPolicy);

    const keycloakPolicy: Allow = {
      direction: Direction.Egress,
      selector: netpolSelector,
      remoteNamespace: "keycloak",
      remoteSelector: { "app.kubernetes.io/name": "keycloak" },
      port: 8080,
      description: `${sanitizeResourceName(sso.clientId)} keycloak JWKS egress`,
    };

    // Generate the policy
    const keycloakGeneratedPolicy = generate(namespace, keycloakPolicy, istioMode as Mode);
    policies.push(keycloakGeneratedPolicy);

    // Add waypoint network policies for ambient mode
    if (shouldUseAmbientWaypoint(pkg)) {
      const waypointName = getWaypointName(sso.clientId);
      const appSelector = sso.enableAuthserviceSelector;

      // Egress policy: Allow traffic from waypoint to istiod
      const istiodPolicy = allowEgressIstiod(namespace, sso.clientId, netpolSelector);

      // Add labels to the generated policy
      istiodPolicy.metadata = {
        ...istiodPolicy.metadata,
        labels: {
          ...istiodPolicy.metadata?.labels,
          "uds/sso-client": sso.clientId,
        },
      };
      policies.push(istiodPolicy);

      // Egress policy: Allow traffic from waypoint to app pods
      policies.push(
        generate(namespace, {
          direction: Direction.Egress,
          selector: { "istio.io/gateway-name": waypointName },
          remoteSelector: appSelector,
          description: `Allow traffic from ${waypointName} to app`,
        }),
      );

      // Add ingress policy to app pods to allow traffic from waypoint
      policies.push(
        generate(namespace, {
          direction: Direction.Ingress,
          selector: appSelector,
          remoteSelector: { "istio.io/gateway-name": waypointName },
          description: `Allow traffic from ${waypointName} to app pods`,
        }),
      );

      // Health check policy: Allow monitoring access to waypoint
      policies.push(
        generate(namespace, {
          direction: Direction.Ingress,
          selector: { "istio.io/gateway-name": waypointName },
          remoteNamespace: "monitoring",
          remoteSelector: { app: "prometheus" },
          ports: [
            15020, // Envoy admin port
          ],
          description: `Allow health checks from monitoring to ${waypointName}`,
        }),
      );
    }
  }

  // Generate NetworkPolicies for any monitors that are generated
  const monitorList = pkg.spec?.monitor ?? [];
  // Iterate over each monitor
  for (const monitor of monitorList) {
    const { selector, targetPort, podSelector } = monitor;

    // Find if this service has a matching client with waypoint
    const matchingClient = findMatchingClient(pkg, selector);
    const waypointName = matchingClient ? getWaypointName(matchingClient.clientId) : undefined;

    // Use waypoint selector only if we have a waypoint and the package is configured for ambient waypoint
    const allowSelector = waypointName
      ? getPodSelector(pkg, podSelector ?? selector, waypointName)
      : (podSelector ?? selector);

    // Create the NetworkPolicy for the monitor
    const policy: Allow = {
      direction: Direction.Ingress,
      selector: allowSelector,
      remoteNamespace: "monitoring",
      remoteSelector: {
        app: "prometheus",
      },
      port: targetPort,
      // Use the targetPort and selector to generate a description for the monitoring derived policies
      description: `${targetPort}-${Object.values(selector)} Metrics`,
    };
    // Generate the policy
    const generatedPolicy = generate(namespace, policy, istioMode as Mode);
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
        UDSConfig.kubeApiCIDR &&
        policy.metadata.labels["uds/generated"] === RemoteGenerated.KubeAPI
      ) {
        message +=
          ", ensure that the KUBEAPI_CIDR override configured for the operator is correct.";
      }
      if (
        UDSConfig.kubeNodeCIDRs.length > 0 &&
        policy.metadata.labels["uds/generated"] === RemoteGenerated.KubeNodes
      ) {
        message +=
          ", ensure that the KUBENODE_CIDRS override configured for the operator is correct.";
      }
      throw new Error(message);
    }
  }

  await retryWithDelay(async function purgeOrphanedNetworkPolicies() {
    return purgeOrphans(generation, namespace, pkgName, kind.NetworkPolicy, log);
  }, log);

  // Return the list of policies
  return policies;
}
// @lulaEnd a9d420a8-1ad2-479f-a438-aa4ca0f57473
// @lulaEnd cd540e07-153b-424c-90e0-c0daec56b18f
// @lulaEnd cd540e07-153b-424c-90e0-c0daec56b16a
