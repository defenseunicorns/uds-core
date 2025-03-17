/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import {
  Allow,
  Expose,
  Gateway,
  IstioAuthorizationPolicy,
  RemoteGenerated,
  UDSPackage,
} from "../../crd";
import { Action } from "../../crd/generated/istio/authorizationpolicy-v1beta1";

// Type for the "source" field in a policy rule.
type PolicySource = {
  namespaces?: string[];
  notNamespaces?: string[];
  principals?: string[];
};

// Internal type used for grouping rules before generating policies.
interface RuleGroup {
  selector?: { [key: string]: string };
  rules: Array<{
    source: PolicySource;
    ports: Set<string>;
  }>;
}

function addRuleToGroup(group: RuleGroup, source: PolicySource, ports: string[]): void {
  const existing = group.rules.find(r => JSON.stringify(r.source) === JSON.stringify(source));
  if (existing) {
    ports.forEach(p => existing.ports.add(p));
  } else {
    group.rules.push({ source, ports: new Set(ports) });
  }
}

// Derive a short policy name from a selector.
// If an "app" label exists, we strip any trailing "-pod"; otherwise use "app.kubernetes.io/name" with a "-workload" suffix.
function derivePolicyName(selector: { [key: string]: string }): string {
  if (selector["app"]) {
    return selector["app"].replace(/-pod$/, "");
  } else if (selector["app.kubernetes.io/name"]) {
    return selector["app.kubernetes.io/name"].replace(/-pod$/, "") + "-workload";
  }
  return "workload";
}

/**
 * Generate Istio Authorization Policies for a given UDSPackage.
 *
 * For each allow or expose rule with port information, a DENY policy rule is generated
 * with a "to" clause that uses the "notPorts" field to protect that port.
 *
 * Rules with a selector are grouped into workload policies, while rules without a selector
 * are merged into a single namespace policy.
 */
export async function generateAuthorizationPolicies(
  pkg: UDSPackage,
  overrideNamespace?: string,
): Promise<IstioAuthorizationPolicy[]> {
  const pkgName: string = pkg.metadata?.name ?? "unknown";
  const pkgNamespace: string = pkg.metadata?.namespace ?? overrideNamespace ?? "default";
  const generation: string = pkg.metadata?.generation?.toString() ?? "0";

  const workloadGroups: Map<string, RuleGroup> = new Map();
  const nsGroup: RuleGroup = { rules: [] };

  function processRule(rule: Allow | Expose, isExpose: boolean = false): void {
    const ports: string[] = [];
    if (rule.port !== undefined) {
      ports.push(rule.port.toString());
    }
    if ("ports" in rule && rule.ports) {
      ports.push(...rule.ports.map((p: number) => p.toString()));
    }
    if (ports.length === 0) {
      return;
    }
    let source: PolicySource = {};
    if (isExpose) {
      const exposeRule = rule as Expose;
      if (exposeRule.gateway === Gateway.Admin) {
        source = { namespaces: ["istio-admin-gateway"] };
      } else {
        source = { namespaces: [pkgNamespace] };
      }
    } else {
      const allowRule = rule as Allow;
      if (allowRule.remoteGenerated === RemoteGenerated.IntraNamespace) {
        source = { namespaces: [pkgNamespace] };
      } else if (
        allowRule.remoteNamespace &&
        allowRule.remoteNamespace !== "" &&
        allowRule.remoteNamespace !== "*"
      ) {
        source = { namespaces: [allowRule.remoteNamespace] };
      } else if (
        allowRule.remoteNamespace === "*" ||
        allowRule.remoteGenerated === RemoteGenerated.Anywhere
      ) {
        source = { notNamespaces: [pkgNamespace] };
      } else {
        source = { namespaces: [pkgNamespace] };
      }
      if (allowRule.remoteServiceAccount && allowRule.remoteServiceAccount.trim() !== "") {
        const nsForSA =
          allowRule.remoteNamespace && allowRule.remoteNamespace !== ""
            ? allowRule.remoteNamespace
            : pkgNamespace;
        source = {
          principals: [`cluster.local/ns/${nsForSA}/sa/${allowRule.remoteServiceAccount}`],
        };
      }
    }
    if ("selector" in rule && rule.selector) {
      const key = JSON.stringify(rule.selector);
      let group = workloadGroups.get(key);
      if (!group) {
        group = { selector: rule.selector, rules: [] };
        workloadGroups.set(key, group);
      }
      addRuleToGroup(group, source, ports);
    } else {
      addRuleToGroup(nsGroup, source, ports);
    }
  }

  if (pkg.spec?.network?.allow) {
    for (const rule of pkg.spec.network.allow) {
      processRule(rule, false);
    }
  }
  if (pkg.spec?.network?.expose) {
    for (const rule of pkg.spec.network.expose) {
      processRule(rule, true);
    }
  }

  const policies: IstioAuthorizationPolicy[] = [];

  for (const group of workloadGroups.values()) {
    const derivedName = derivePolicyName(group.selector!);
    const policyName = `protect-${pkgName}-${derivedName}`;
    const rules = group.rules.map(r => ({
      from: [{ source: r.source }],
      to: [{ operation: { notPorts: Array.from(r.ports) } }],
    }));
    const policy: IstioAuthorizationPolicy = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: policyName,
        namespace: pkgNamespace,
        labels: { "uds/package": pkgName, "uds/generation": generation },
      },
      spec: {
        action: Action.Deny,
        selector: { matchLabels: group.selector! },
        rules,
      },
    };
    policies.push(policy);
  }

  if (nsGroup.rules.length > 0) {
    const policyName = `protect-${pkgName}-ns`;
    const rules = nsGroup.rules.map(r => ({
      from: [{ source: r.source }],
      to: [{ operation: { notPorts: Array.from(r.ports) } }],
    }));
    const nsPolicy: IstioAuthorizationPolicy = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: policyName,
        namespace: pkgNamespace,
        labels: { "uds/package": pkgName, "uds/generation": generation },
      },
      spec: {
        action: Action.Deny,
        rules,
      },
    };
    policies.push(nsPolicy);
  }

  return policies;
}
