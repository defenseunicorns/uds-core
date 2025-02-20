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

/**
 * Generates and applies AuthorizationPolicies for the given package if the namespace is ambient.
 * @param pkg The UDSPackage for which to generate policies.
 * @param namespace The namespace in which the package resides.
 * @returns The generated AuthorizationPolicies.
 */
export async function authorizationPolicies(pkg: UDSPackage, namespace: string) {
  log.info(
    `Starting authorization policy generation for package: ${pkg.metadata!.name} in namespace: ${namespace}`,
  );

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

  return applyAuthorizationPolicies(policies);
}

/**
 * Applies the given AuthorizationPolicies to the cluster.
 * @param policies List of IstioAuthorizationPolicy objects to apply.
 * @returns The applied policies.
 */
async function applyAuthorizationPolicies(policies: IstioAuthorizationPolicy[]) {
  log.info(`Applying ${policies.length} AuthorizationPolicies`);

  try {
    await Promise.all(
      policies.map(policy => K8s(IstioAuthorizationPolicy).Apply(policy, { force: true })),
    );
  } catch (err) {
    log.error("Failed to apply one or more AuthorizationPolicies:", err);
    throw err;
  }

  return policies;
}

/**
 * Determines whether a namespace contains only ambient service mesh packages.
 * @param namespace The namespace to check.
 * @returns `true` if all packages in the namespace are ambient; otherwise, `false`.
 */
export async function isNamespaceAmbient(namespace: string): Promise<boolean> {
  const packages = await K8s(UDSPackage).InNamespace(namespace).Get();
  return packages.items.every(pkg => pkg.spec?.network?.serviceMesh?.ambient === true);
}

/**
 * Utility function to retrieve or create a Set within a Map.
 * @param map The map containing sets of values.
 * @param key The key to retrieve or create.
 * @returns The set of values associated with the key.
 */
function getOrCreate<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  if (!map.has(key)) {
    map.set(key, new Set());
  }
  return map.get(key)!;
}

/**
 * Utility function to retrieve or create an array within a Map.
 * @param map The map containing arrays of values.
 * @param key The key to retrieve or create.
 * @returns The array of values associated with the key.
 */
function getOrCreateArray<K, V>(map: Map<K, V[]>, key: K): V[] {
  if (!map.has(key)) {
    map.set(key, []);
  }
  return map.get(key)!;
}

interface IstioRule {
  from: { source: { notNamespaces: string[]; notPrincipals?: string[] } }[];
  to: { operation: { ports?: string[]; notPorts?: string[] } }[];
}

/**
 * Creates a deny rule for an Istio AuthorizationPolicy.
 * @param remoteNamespace The namespace to deny.
 * @param remoteServiceAccount (Optional) The specific service account to deny.
 * @param port (Optional) The port to apply the rule to.
 * @returns An IstioRule object representing the deny rule.
 */
function createDenyRule(
  remoteNamespace: string,
  remoteServiceAccount?: string,
  port?: string,
): IstioRule {
  const denyRule: IstioRule = {
    from: [{ source: { notNamespaces: [remoteNamespace] } }],
    to: [{ operation: { ports: port ? [port] : undefined } }],
  };

  if (remoteServiceAccount) {
    denyRule.from[0].source.notPrincipals = [
      `cluster.local/ns/${remoteNamespace}/sa/${remoteServiceAccount}`,
    ];
  }

  return denyRule;
}

/**
 * Generates a unique key for a selector by sorting its entries.
 * @param selector A key-value object representing a Kubernetes selector.
 * @returns A string representation of the selector.
 */
function getSelectorKey(selector: Record<string, string>): string {
  return Object.entries(selector)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

/**
 * Creates an Istio AuthorizationPolicy object.
 * @param pkg The UDSPackage defining the policy.
 * @param namespace The namespace for the policy.
 * @param name The name of the policy.
 * @param rules The deny rules for the policy.
 * @returns An IstioAuthorizationPolicy object.
 */
function createAuthorizationPolicy(
  pkg: UDSPackage,
  namespace: string,
  name: string,
  rules: IstioRule[],
): IstioAuthorizationPolicy {
  return {
    apiVersion: "security.istio.io/v1beta1",
    kind: "AuthorizationPolicy",
    metadata: {
      name: sanitizeResourceName(name),
      namespace,
      labels: {
        "uds/package": pkg.metadata!.name!,
        "uds/generation": pkg.metadata!.generation!.toString(),
      },
      ownerReferences: getOwnerRef(pkg),
    },
    spec: { action: Action.Deny, rules },
  };
}

/**
 * Generates AuthorizationPolicies based on the allow rules in a UDSPackage.
 * @param pkg The UDSPackage containing network allow rules.
 * @param namespace The namespace for the policies.
 * @returns An array of IstioAuthorizationPolicy objects.
 */
export function generateAuthorizationPolicies(
  pkg: UDSPackage,
  namespace: string,
): IstioAuthorizationPolicy[] {
  log.info(
    `Generating AuthorizationPolicies for package ${pkg.metadata!.name} in namespace ${namespace}`,
  );

  const rules = pkg.spec?.network?.allow ?? [];
  log.debug(`Processing ${rules.length} allow rules for package ${pkg.metadata!.name}.`);

  if (rules.length === 0) {
    log.info(
      `No allow rules found for package ${pkg.metadata!.name}. Skipping AuthorizationPolicy.`,
    );
    return [];
  }

  const hasIngressWithPort =
    rules.some(rule => rule.direction === Direction.Ingress) ||
    pkg.spec?.network?.expose?.some(exp => exp.port) ||
    pkg.spec?.monitor?.some(mon => mon.targetPort);

  if (!hasIngressWithPort) {
    log.info(
      `No relevant Ingress rules found. Skipping AuthorizationPolicy for ${pkg.metadata!.name}.`,
    );
    return [];
  }

  const policies: IstioAuthorizationPolicy[] = [];
  const denyNamespacesByPort = new Map<string, Set<string>>();
  const denyPrincipalsByPort = new Map<string, Set<string>>();
  const globalDenyNamespaces = new Set<string>();
  const rulesBySelector = new Map<string, Allow[]>();
  const rulesWithoutSelector: Allow[] = [];
  const warnedServiceAccounts = new Set<string>();

  const notPortsRule: IstioRule = {
    from: [{ source: { notNamespaces: [] } }],
    to: [{ operation: { notPorts: [] } }],
  };

  for (const rule of rules) {
    const { remoteNamespace, remoteServiceAccount, port, selector, direction } = rule;

    if (direction === Direction.Egress) continue;

    if (selector) {
      const selectorKey = getSelectorKey(selector);
      getOrCreateArray(rulesBySelector, selectorKey).push(rule);
    } else {
      log.warn(`Selector is missing or undefined for rule: ${JSON.stringify(rule)}`);
      rulesWithoutSelector.push(rule);
    }

    if (remoteNamespace) {
      getOrCreate(denyNamespacesByPort, port ? port.toString() : "ALL").add(remoteNamespace);
      if (!port) globalDenyNamespaces.add(remoteNamespace);
    }

    if (remoteServiceAccount && remoteNamespace) {
      const principal = `cluster.local/ns/${remoteNamespace}/sa/${remoteServiceAccount}`;
      getOrCreate(denyPrincipalsByPort, port ? port.toString() : "ALL").add(principal);
    } else if (remoteServiceAccount && !warnedServiceAccounts.has(remoteServiceAccount)) {
      log.warn(
        `Ignoring remoteServiceAccount '${remoteServiceAccount}' because remoteNamespace is missing.`,
      );
      warnedServiceAccounts.add(remoteServiceAccount);
    }

    if (!port && remoteNamespace) {
      notPortsRule.from[0].source.notNamespaces!.push(remoteNamespace);
    } else if (port !== undefined) {
      getOrCreate(denyNamespacesByPort, port.toString()).add(remoteNamespace!);
      notPortsRule.to[0].operation.notPorts!.push(port.toString());
    }
  }

  for (const denySet of denyNamespacesByPort.values()) {
    globalDenyNamespaces.forEach(ns => denySet.add(ns));
  }

  for (const [selectorKey, selectorRules] of rulesBySelector.entries()) {
    log.debug(`Processing selector: ${selectorKey} with ${selectorRules.length} rules`);

    const denyRules = selectorRules
      .filter(rule => rule.remoteNamespace)
      .map(rule =>
        createDenyRule(rule.remoteNamespace!, rule.remoteServiceAccount, rule.port?.toString()),
      );

    if (denyRules.length > 0) {
      policies.push(
        createAuthorizationPolicy(
          pkg,
          namespace,
          `deny-${pkg.metadata!.name}-${selectorKey}`,
          denyRules,
        ),
      );
    }
  }

  if (rulesWithoutSelector.length > 0) {
    log.debug(`Processing ${rulesWithoutSelector.length} rules without a selector`);

    const denyRules = rulesWithoutSelector
      .filter(rule => rule.remoteNamespace)
      .map(rule =>
        createDenyRule(rule.remoteNamespace!, rule.remoteServiceAccount, rule.port?.toString()),
      );

    if (denyRules.length > 0) {
      policies.push(
        createAuthorizationPolicy(
          pkg,
          namespace,
          `deny-${pkg.metadata!.name}-no-selector`,
          denyRules,
        ),
      );
    }
  }

  if (
    notPortsRule.from[0].source.notNamespaces!.length > 0 &&
    notPortsRule.to[0].operation.notPorts!.length > 0
  ) {
    policies.push(
      createAuthorizationPolicy(pkg, namespace, `deny-${pkg.metadata!.name}-notPorts`, [
        notPortsRule,
      ]),
    );
  }

  if (globalDenyNamespaces.size > 0 || rulesWithoutSelector.length > 0) {
    const denyRules: IstioRule[] = [];

    for (const [port, namespaces] of denyNamespacesByPort.entries()) {
      denyRules.push({
        from: [{ source: { notNamespaces: Array.from(namespaces) } }],
        to: [{ operation: { ports: port !== "ALL" ? [port] : undefined } }],
      });
    }

    if (globalDenyNamespaces.size > 0) {
      denyRules.push({
        from: [{ source: { notNamespaces: Array.from(globalDenyNamespaces) } }],
        to: [{ operation: {} }],
      });
    }

    if (denyRules.length > 0) {
      policies.push(
        createAuthorizationPolicy(
          pkg,
          namespace,
          `deny-${pkg.metadata!.name}-namespace-wide`,
          denyRules,
        ),
      );
    }
  }

  return policies;
}
