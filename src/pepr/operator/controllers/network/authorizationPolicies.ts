/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { Allow, Expose, Gateway, RemoteGenerated, UDSPackage } from "../../crd";
import {
  Action,
  AuthorizationPolicy,
  Rule,
  Source,
} from "../../crd/generated/istio/authorizationpolicy-v1beta1";
import { purgeOrphans } from "../utils";

const log = setupLogger(Component.OPERATOR_NETWORK);

/**
 * Internal grouping types.
 */
interface Group {
  selector: { [key: string]: string };
  rules: { source: Source; ports: Set<string> }[];
}

/**
 * Returns a canonical JSON string for the given object.
 */
function canonicalize(obj: unknown): string {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedObj[key] = (obj as Record<string, unknown>)[key];
    }
    return JSON.stringify(sortedObj);
  }
  return JSON.stringify(obj);
}

/**
 * Merges a rule (its source and ports) into an existing group.
 */
function mergeRule(group: Group, source: Source, ports: string[]): void {
  const key = canonicalize(source);
  const existing = group.rules.find(r => canonicalize(r.source) === key);
  if (existing) {
    ports.forEach(p => existing.ports.add(p));
    log.debug(`Merged ports into existing group for source: ${key}`);
  } else {
    group.rules.push({ source, ports: new Set(ports) });
    log.debug(`Created new rule entry for source: ${key} with ports: ${ports.join(", ")}`);
  }
}

/**
 * Derives a policy name from a selector.
 */
function derivePolicyName(selector: { [key: string]: string }): string {
  if (selector["app"]) return selector["app"].replace(/-pod$/, "");
  if (selector["app.kubernetes.io/name"])
    return selector["app.kubernetes.io/name"].replace(/-pod$/, "") + "-workload";
  return "workload";
}

/**
 * Processes a single rule (from either the allow or expose block) and returns its effective source and ports.
 */
function processSingleRule(
  rule: Allow | Expose,
  isExpose: boolean,
  pkgNamespace: string,
): { source: Source; ports: string[] } {
  const ports: string[] = [];
  if (isExpose) {
    const r = rule as Expose;
    const effectivePort = r.targetPort ?? r.port;
    if (effectivePort !== undefined) ports.push(effectivePort.toString());
  } else {
    const r = rule as Allow;
    if (r.port !== undefined) ports.push(r.port.toString());
    if (r.ports) ports.push(...r.ports.map(p => p.toString()));
  }

  let source: Source = {};
  if (isExpose) {
    const r = rule as Expose;
    source =
      r.gateway === Gateway.Admin
        ? { namespaces: ["istio-admin-gateway"] }
        : { namespaces: [pkgNamespace] };
  } else {
    const r = rule as Allow;
    if (r.remoteGenerated === RemoteGenerated.IntraNamespace) {
      source = { namespaces: [pkgNamespace] };
    } else if (r.remoteNamespace && r.remoteNamespace !== "" && r.remoteNamespace !== "*") {
      source = { namespaces: [r.remoteNamespace] };
    } else if (r.remoteNamespace === "*" || r.remoteGenerated === RemoteGenerated.Anywhere) {
      source = { notNamespaces: [pkgNamespace] };
    } else {
      source = { namespaces: [pkgNamespace] };
    }
    if (r.remoteServiceAccount && r.remoteServiceAccount.trim() !== "") {
      const nsForSA =
        r.remoteNamespace && r.remoteNamespace !== "" ? r.remoteNamespace : pkgNamespace;
      source = { principals: [`cluster.local/ns/${nsForSA}/sa/${r.remoteServiceAccount}`] };
    }
  }
  return { source, ports };
}

/**
 * Generate and apply Istio Authorization Policies for a given UDSPackage.
 *
 * Processes allow, expose, and monitor rules. Rules with a selector are grouped into workload policies;
 * rules without a selector are merged into a namespace-wide policy; and each monitor entry produces its own policy.
 */
export async function generateAuthorizationPolicies(
  pkg: UDSPackage,
  overrideNamespace?: string,
): Promise<AuthorizationPolicy[]> {
  const pkgName = pkg.metadata?.name ?? "unknown";
  const pkgNamespace = pkg.metadata?.namespace ?? overrideNamespace ?? "default";
  const generation = pkg.metadata?.generation?.toString() ?? "0";
  log.info(
    `Starting policy generation for package "${pkgName}" in namespace "${pkgNamespace}" (generation ${generation}).`,
  );

  const workloadGroups = new Map<string, Group>();
  const nsGroup: Group = { selector: {}, rules: [] };

  // Process allow and expose rules.
  if (pkg.spec?.network) {
    const process = (rules: (Allow | Expose)[], isExpose: boolean) => {
      for (const rule of rules) {
        log.debug(`Processing ${isExpose ? "Expose" : "Allow"} rule: ${JSON.stringify(rule)}`);
        const { source, ports } = processSingleRule(rule, isExpose, pkgNamespace);
        if (rule.selector) {
          const key = canonicalize(rule.selector);
          let group = workloadGroups.get(key);
          if (!group) {
            group = { selector: rule.selector, rules: [] };
            workloadGroups.set(key, group);
            log.debug(`Created new rule group for selector: ${key}`);
          }
          mergeRule(group, source, ports);
        } else {
          mergeRule(nsGroup, source, ports);
        }
      }
    };
    if (pkg.spec.network.allow) process(pkg.spec.network.allow, false);
    if (pkg.spec.network.expose) process(pkg.spec.network.expose, true);
  }

  const policies: AuthorizationPolicy[] = [];

  // Build workload policies.
  for (const [selectorKey, group] of workloadGroups.entries()) {
    const policyName = `protect-${pkgName}-${derivePolicyName(group.selector)}`;
    log.debug(`Generating workload policy "${policyName}" for selector: ${selectorKey}`);
    const rules: Rule[] = group.rules.map(gr => {
      const rule: Rule = { from: [{ source: gr.source }] };
      if (gr.ports.size > 0) rule.to = [{ operation: { ports: Array.from(gr.ports) } }];
      return rule;
    });
    policies.push({
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: policyName,
        namespace: pkgNamespace,
        labels: { "uds/package": pkgName, "uds/generation": generation },
      },
      spec: { action: Action.Allow, selector: { matchLabels: group.selector }, rules },
    });
  }

  // Build namespace-wide policy.
  if (nsGroup.rules.length > 0) {
    const policyName = `protect-${pkgName}-ns`;
    log.debug(`Generating namespace-wide policy "${policyName}"`);
    const rules: Rule[] = nsGroup.rules.map(gr => {
      const rule: Rule = { from: [{ source: gr.source }] };
      if (gr.ports.size > 0) rule.to = [{ operation: { ports: Array.from(gr.ports) } }];
      return rule;
    });
    policies.push({
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: policyName,
        namespace: pkgNamespace,
        labels: { "uds/package": pkgName, "uds/generation": generation },
      },
      spec: { action: Action.Allow, rules },
    });
  }

  // Process monitor block: generate one policy per monitor entry.
  if (pkg.spec?.monitor) {
    for (const monitor of pkg.spec.monitor) {
      const mSelector = monitor.podSelector ?? monitor.selector;
      const monitorRule: Rule = {
        from: [{ source: { namespaces: ["monitoring"] } }],
        to: [{ operation: { ports: [monitor.targetPort.toString()] } }],
      };
      const monitorPolicyName = `protect-${pkgName}-monitor-${derivePolicyName(mSelector)}`;
      log.debug(
        `Generating monitor policy "${monitorPolicyName}" for selector: ${canonicalize(mSelector)}`,
      );
      policies.push({
        apiVersion: "security.istio.io/v1beta1",
        kind: "AuthorizationPolicy",
        metadata: {
          name: monitorPolicyName,
          namespace: pkgNamespace,
          labels: { "uds/package": pkgName, "uds/generation": generation },
        },
        spec: { action: Action.Allow, selector: { matchLabels: mSelector }, rules: [monitorRule] },
      });
    }
  }

  // Apply the generated policies.
  for (const policy of policies) {
    try {
      await K8s(AuthorizationPolicy).Apply(policy, { force: true });
      log.info(
        `Applied AuthorizationPolicy ${policy.metadata?.name} in namespace ${policy.metadata?.namespace}`,
      );
    } catch (err: unknown) {
      log.error(
        err,
        `Error applying AuthorizationPolicy ${policy.metadata?.name} in namespace ${policy.metadata?.namespace}`,
      );
    }
  }

  await purgeOrphans(generation, pkgNamespace, pkgName, AuthorizationPolicy, log);
  return policies;
}
