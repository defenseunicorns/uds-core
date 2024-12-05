/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { UDSConfig } from "../../../config";
import { Component, setupLogger } from "../../../logger";
import { Allow, Direction, Gateway, RemoteGenerated, UDSPackage } from "../../crd";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";
import { allowEgressDNS } from "./defaults/allow-egress-dns";
import { allowEgressIstiod } from "./defaults/allow-egress-istiod";
import { allowIngressSidecarMonitoring } from "./defaults/allow-ingress-sidecar-monitoring";
import { defaultDenyAll } from "./defaults/default-deny-all";
import { generate } from "./generate";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_NETWORK);

export async function networkPolicies(pkg: UDSPackage, namespace: string) {
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

    // Istio rules
    allowEgressIstiod(namespace),
    allowIngressSidecarMonitoring(namespace),
  ];

  // Process custom policies
  for (const policy of customPolicies) {
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Generate NetworkPolicies for any VirtualServices that are generated
  const exposeList = pkg.spec?.network?.expose ?? [];
  // Iterate over each exposed service, excluding directResponse services
  for (const expose of exposeList.filter(exp => !exp.advancedHTTP?.directResponse)) {
    const { gateway = Gateway.Tenant, port, selector = {}, targetPort } = expose;

    // Use the same port as the VirtualService if targetPort is not set
    const policyPort = targetPort ?? port;

    // Create the NetworkPolicy for the VirtualService
    const policy: Allow = {
      direction: Direction.Ingress,
      selector,
      remoteNamespace: `istio-${gateway}-gateway`,
      remoteSelector: {
        app: `${gateway}-ingressgateway`,
      },
      port: policyPort,
      // Use the port, selector, and gateway to generate a description for VirtualService derived policies
      description: `${policyPort}-${Object.values(selector)} Istio ${gateway} gateway`,
    };

    // Generate the policy
    const generatedPolicy = generate(namespace, policy);
    policies.push(generatedPolicy);
  }

  // Add a network policy for each sso block with authservice enabled (if any pkg.spec.sso[*].enableAuthserviceSelector is set)
  const ssos = pkg.spec?.sso?.filter(sso => sso.enableAuthserviceSelector);

  for (const sso of ssos || []) {
    const policy: Allow = {
      direction: Direction.Egress,
      selector: sso.enableAuthserviceSelector,
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
      selector: sso.enableAuthserviceSelector,
      remoteNamespace: "keycloak",
      remoteSelector: { "app.kubernetes.io/name": "keycloak" },
      port: 8080,
      description: `${sanitizeResourceName(sso.clientId)} keycloak JWKS egress`,
    };

    // Generate the policy
    const keycloakGeneratedPolicy = generate(namespace, keycloakPolicy);
    policies.push(keycloakGeneratedPolicy);
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
      throw new Error(message);
    }
  }

  await purgeOrphans(generation, namespace, pkgName, kind.NetworkPolicy, log);

  // Return the list of policies
  return policies;
}
