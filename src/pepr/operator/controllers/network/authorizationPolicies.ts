/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { IstioAuthorizationPolicy, RemoteGenerated, UDSPackage } from "../../crd";
import { Action } from "../../crd/generated/istio/authorizationpolicy-v1beta1";

// --- The Generator Function ---

export async function generateAuthorizationPolicies(
  pkg: UDSPackage,
  overrideNamespace?: string,
): Promise<IstioAuthorizationPolicy[]> {
  // Determine package name, namespace, generation (with defaults)
  const pkgName = pkg.metadata?.name;
  const pkgNamespace = pkg.metadata?.namespace || overrideNamespace || "default";
  const generation =
    pkg.metadata?.generation !== undefined ? pkg.metadata.generation.toString() : "1";

  // We will create two maps: one for pod-based (selector) policies and one for namespace-wide policies.
  const podPolicies = new Map<string, IstioAuthorizationPolicy>();
  const nsPolicies = new Map<string, IstioAuthorizationPolicy>();

  // Helper to get (or create) a pod-based policy for a given selector
  function getOrCreatePodPolicy(selector: Record<string, string>): IstioAuthorizationPolicy {
    const key = JSON.stringify(selector);
    if (!podPolicies.has(key)) {
      const policy: IstioAuthorizationPolicy = {
        apiVersion: "security.istio.io/v1beta1",
        kind: "AuthorizationPolicy",
        metadata: {
          name: `protect-${pkgName}-workload`,
          namespace: pkgNamespace,
          labels: { "uds/package": pkgName!, "uds/generation": generation },
        },
        spec: {
          action: Action.Deny,
          selector: { matchLabels: selector },
          rules: [],
        },
      };
      podPolicies.set(key, policy);
    }
    return podPolicies.get(key)!;
  }

  // Helper to get (or create) a namespace-wide policy
  function getOrCreateNSPolicy(): IstioAuthorizationPolicy {
    const nsPolicyName = `protect-${pkgName}-ns`;
    if (!nsPolicies.has(nsPolicyName)) {
      const policy: IstioAuthorizationPolicy = {
        apiVersion: "security.istio.io/v1beta1",
        kind: "AuthorizationPolicy",
        metadata: {
          name: nsPolicyName,
          namespace: pkgNamespace,
          labels: { "uds/package": pkgName!, "uds/generation": generation },
        },
        spec: {
          action: Action.Deny,
          rules: [],
        },
      };
      nsPolicies.set(nsPolicyName, policy);
    }
    return nsPolicies.get(nsPolicyName)!;
  }

  // Process each allow rule from the package
  if (pkg.spec?.network && pkg.spec.network.allow) {
    for (const rule of pkg.spec.network.allow) {
      // Only consider rules that define a port (or ports)
      const portNumbers: number[] = [];
      if (rule.port !== undefined) {
        portNumbers.push(rule.port);
      }
      if (rule.ports) {
        portNumbers.push(...rule.ports);
      }
      if (portNumbers.length === 0) {
        continue; // skip rules without port info
      }
      // Convert port numbers to strings
      const portStrings = portNumbers.map(p => p.toString());

      // If the rule is an IntraNamespace rule, add it to the namespace-wide policy.
      if (rule.remoteGenerated === RemoteGenerated.IntraNamespace) {
        const nsPolicy = getOrCreateNSPolicy();
        // Merge into one rule for this policy: from the package's own namespace
        // (If a similar rule already exists, merge the port lists.)
        const existingRule = nsPolicy.spec?.rules?.find(
          r =>
            r.from &&
            r.from.some(s => s.source?.namespaces && s.source.namespaces.includes(pkgNamespace)),
        );
        if (existingRule) {
          const existingNotPorts = existingRule.to?.[0]?.operation?.notPorts || [];
          const mergedNotPorts = Array.from(new Set([...existingNotPorts, ...portStrings]));
          existingRule.to = [{ operation: { notPorts: mergedNotPorts } }];
        } else {
          nsPolicy.spec?.rules?.push({
            from: [{ source: { namespaces: [pkgNamespace] } }],
            to: [{ operation: { notPorts: portStrings } }],
          });
        }
      } else {
        // Process pod-based (selector) rules
        // Determine the selector: if provided use it; otherwise use an empty object.
        const selector = rule.selector || {};
        const podPolicy = getOrCreatePodPolicy(selector);

        // Now decide whether to use a positive "namespaces" clause or a negative "notNamespaces"
        if (rule.remoteNamespace !== undefined) {
          if (rule.remoteNamespace === "" || rule.remoteNamespace === "*") {
            // This indicates "Anywhere" (all namespaces) – so use notNamespaces with local pkgNamespace.
            podPolicy.spec?.rules?.push({
              from: [{ source: { notNamespaces: [pkgNamespace] } }],
              to: [{ operation: { notPorts: portStrings } }],
            });
          } else {
            // Specific remote namespace provided; allow only traffic from that namespace.
            podPolicy.spec?.rules?.push({
              from: [{ source: { namespaces: [rule.remoteNamespace] } }],
              to: [{ operation: { notPorts: portStrings } }],
            });
          }
        } else if (rule.remoteGenerated === RemoteGenerated.Anywhere) {
          // Treat as Anywhere if remoteNamespace is not set
          podPolicy.spec?.rules?.push({
            from: [{ source: { notNamespaces: [] } }], // empty list means no filtering on namespace
            to: [{ operation: { notPorts: portStrings } }],
          });
        }
      }
    }
  }

  // (Optional) Process expose rules if needed. For example, Grafana's expose rule might require
  // additional policies. In our tests Grafana has an expose entry that is used to create a namespace-wide
  // policy. In this first iteration, we assume that the pod-based policies already cover expose entries.
  if (pkg.spec?.network && pkg.spec.network.expose) {
    for (const expose of pkg.spec.network.expose) {
      // If an expose rule defines a selector and targetPort, then we may want to create a policy that
      // protects that port from unwanted external traffic.
      if (expose.selector && expose.targetPort !== undefined) {
        const podPolicy = getOrCreatePodPolicy(expose.selector);
        // For simplicity, assume that for an expose rule we allow traffic only from specific sources.
        // (Your logic may need to be extended based on additional fields such as gateway, host, etc.)
        // For our Grafana test, we expect a rule from certain namespaces.
        // Here we do not add a rule if one already exists for that port.
        const portStr = expose.targetPort.toString();
        const alreadyPresent = podPolicy.spec?.rules?.some(
          r => r.to && r.to.some(op => op.operation?.ports && op.operation.ports.includes(portStr)),
        );
        if (!alreadyPresent) {
          // We add an empty rule (or one that can later be merged with allow rules)
          podPolicy.spec?.rules?.push({
            to: [{ operation: { ports: [portStr] } }],
          });
        }
      }
    }
  }

  // For certain packages (e.g. prometheus-stack, neuvector) our business logic may require multiple policies.
  // For example, if different allow rules have different selectors, we might end up with multiple pod-based policies.
  // Also, some packages (e.g. keycloak) require both a workload policy and a namespace-wide policy.
  // We already accumulated those in podPolicies and nsPolicies.

  console.log(
    "Generated ",
    JSON.stringify([...podPolicies.values(), ...nsPolicies.values()], null, 2),
  );

  // Return all generated policies as an array.
  return [...podPolicies.values(), ...nsPolicies.values()];
}
