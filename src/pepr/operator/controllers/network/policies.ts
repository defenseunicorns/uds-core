/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { UDSConfig } from "../../../config";
import { Component, setupLogger } from "../../../logger";
import {
  Allow,
  Direction,
  Gateway,
  IstioAuthorizationPolicy,
  RemoteGenerated,
  UDSPackage,
} from "../../crd";
import { Action } from "../../crd/generated/istio/authorizationpolicy-v1beta1";
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

export async function authorizationPolicies(pkg: UDSPackage, namespace: string) {
  const isAmbient = await isNamespaceAmbient(namespace);

  if (!isAmbient) {
    log.info(
      `Namespace ${namespace} contains non-ambient packages. Defaulting to Network Policies.`,
    );
    return []; // Default to NetPols instead of Authorization Policies
  }

  const policies = generateAuthorizationPolicies(pkg, namespace);

  // Don't apply a DENY policy if no explicit ALLOW rules exist
  if (policies.length === 0) {
    log.info(
      `No explicit allow rules for package ${pkg.metadata!.name}, skipping AuthorizationPolicy creation.`,
    );
    return [];
  }

  for (const policy of policies) {
    try {
      await K8s(IstioAuthorizationPolicy).Apply(policy, { force: true });
    } catch (err) {
      log.error(`Failed to apply AuthorizationPolicy ${policy.metadata?.name}:`, err);
      throw err;
    }
  }

  return policies;
}

/**
 * Check if all packages in the namespace are in Ambient Mode.
 * If any package is NOT in Ambient Mode, default to Network Policies.
 */
export async function isNamespaceAmbient(namespace: string): Promise<boolean> {
  const packages = await K8s(UDSPackage).InNamespace(namespace).Get();
  return packages.items.every(pkg => pkg.spec?.network?.serviceMesh?.ambient === true);
}

export function generateAuthorizationPolicies(
  pkg: UDSPackage,
  namespace: string,
): IstioAuthorizationPolicy[] {
  if (!pkg.spec?.network?.allow || pkg.spec.network.allow.length === 0) {
    log.info(
      `No explicit network allow rules found for package ${pkg.metadata!.name}, skipping AuthorizationPolicy creation.`,
    );
    return [];
  }

  const rules = pkg.spec.network.allow;
  const policies: IstioAuthorizationPolicy[] = [];

  // Collect deny rules per port and track global namespaces
  const denyNamespacesByPort = new Map<string, Set<string>>();
  const denyPrincipalsByPort = new Map<string, Set<string>>();
  const globalDenyNamespaces = new Set<string>();

  for (const rule of rules) {
    const { remoteNamespace, remoteServiceAccount, port } = rule;
    const portKey = port ? port.toString() : "ALL";

    if (remoteNamespace) {
      if (!port) {
        globalDenyNamespaces.add(remoteNamespace); // This means allow all ports.
      } else {
        if (!denyNamespacesByPort.has(portKey)) {
          denyNamespacesByPort.set(portKey, new Set());
        }
        denyNamespacesByPort.get(portKey)!.add(remoteNamespace);
      }
    }

    if (remoteServiceAccount) {
      if (remoteNamespace) {
        const principal = `cluster.local/ns/${remoteNamespace}/sa/${remoteServiceAccount}`;
        if (!denyPrincipalsByPort.has(portKey)) {
          denyPrincipalsByPort.set(portKey, new Set());
        }
        denyPrincipalsByPort.get(portKey)!.add(principal);
      } else {
        log.warn(
          `Ignoring remoteServiceAccount '${remoteServiceAccount}' because remoteNamespace is missing.`,
        );
      }
    }
  }

  // If no per-port denies exist and only "allow all" namespaces are present, we don't need an AuthorizationPolicy
  if (denyNamespacesByPort.size === 0 && globalDenyNamespaces.size > 0) {
    log.info(
      `Only allow-all namespaces found for package ${pkg.metadata!.name}, skipping AuthorizationPolicy.`,
    );
    return [];
  }

  // Ensure global allow-all namespaces are added to every existing per-port deny rule
  for (const denySet of denyNamespacesByPort.values()) {
    globalDenyNamespaces.forEach(ns => denySet.add(ns));
  }

  // Construct deny rules per port
  const denyRules = [];

  for (const [port, namespaces] of denyNamespacesByPort.entries()) {
    const principals = denyPrincipalsByPort.get(port) ?? new Set();

    denyRules.push({
      from: [
        {
          source: {
            notNamespaces: Array.from(namespaces),
            ...(principals.size > 0 ? { notPrincipals: Array.from(principals) } : {}),
          },
        },
      ],
      to: [{ operation: { ports: [port] } }],
    });
  }

  // Final wildcard deny rule for namespaces that block ALL ports
  if (globalDenyNamespaces.size > 0) {
    const allDeniedPorts = Array.from(denyNamespacesByPort.keys());

    // Apply `notPorts` rule only if there are per-port denies
    if (allDeniedPorts.length > 0) {
      denyRules.push({
        from: [{ source: { notNamespaces: Array.from(globalDenyNamespaces) } }],
        to: [{ operation: { notPorts: allDeniedPorts } }],
      });
    }
  }

  // Only create a policy if there are deny rules
  if (denyRules.length === 0) {
    log.info(
      `No valid deny rules generated for package ${pkg.metadata!.name}, skipping AuthorizationPolicy.`,
    );
    return [];
  }

  const denyPolicy = new IstioAuthorizationPolicy();
  denyPolicy.apiVersion = "security.istio.io/v1beta1";
  denyPolicy.kind = "AuthorizationPolicy";
  denyPolicy.metadata = {
    name: sanitizeResourceName(`deny-${pkg.metadata!.name}`),
    namespace,
    labels: {
      "uds/package": pkg.metadata!.name!,
      "uds/generation": pkg.metadata!.generation!.toString(),
    },
    ownerReferences: getOwnerRef(pkg),
  };

  denyPolicy.spec = {
    action: Action.Deny,
    rules: denyRules,
  };

  policies.push(denyPolicy);
  return policies;
}
