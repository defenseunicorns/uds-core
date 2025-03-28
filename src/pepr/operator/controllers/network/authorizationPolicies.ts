/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { Allow, Expose, Gateway, Monitor, RemoteGenerated, UDSPackage } from "../../crd";
import {
  Action,
  AuthorizationPolicy,
  Rule,
  Source,
} from "../../crd/generated/istio/authorizationpolicy-v1beta1";
import { purgeOrphans } from "../utils";

const log = setupLogger(Component.OPERATOR_NETWORK);

// Constants for gateway principals.
const ADMIN_INGRESS = "cluster.local/ns/istio-admin-gateway/sa/admin-ingressgateway";
const TENANT_INGRESS = "cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway";

/**
 * Type guard to determine if a rule is an Expose rule.
 */
function isExposeRule(rule: Allow | Expose): rule is Expose {
  return "service" in rule && Boolean(rule.service);
}

/**
 * Derives a short name from a selector.
 */
function derivePolicyName(selector: { [key: string]: string }): string {
  if (selector["app"]) return selector["app"].replace(/-pod$/, "");
  if (selector["app.kubernetes.io/name"])
    return selector["app.kubernetes.io/name"].replace(/-pod$/, "") + "-workload";
  return "workload";
}

/**
 * Generates a unique name for an Allow rule.
 * Uses the description if provided; otherwise a combination of the selector values
 * and remote properties is used.
 */
function generateAllowName(rule: Allow): string {
  const { description, selector, remoteGenerated, remoteNamespace, remoteSelector } = rule;
  const baseName =
    description ||
    [
      Object.values(selector || { default: "all pods" }).join("-"),
      remoteGenerated || [
        remoteNamespace || "default",
        Object.values(remoteSelector || { default: "all pods" }).join("-"),
      ],
    ]
      .flat()
      .join("-");
  return `ingress-${baseName}`.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Generates a unique name for an Expose rule using effective port, selector, and gateway.
 */
function generateExposeName(rule: Expose): string {
  const effectivePort = rule.targetPort ?? rule.port;
  const selPart = rule.selector ? Object.values(rule.selector).join("-") : "all";
  const gateway = rule.gateway || "tenant";
  return `ingress-${effectivePort}-${selPart}-istio-${gateway}-gateway`
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Generates a unique authorization policy name for a given rule.
 */
export function generateAuthPolName(rule: Allow | Expose): string {
  return isExposeRule(rule) ? generateExposeName(rule) : generateAllowName(rule);
}

/**
 * Processes an Allow rule to extract its effective source and ports.
 */
function processAllowRule(rule: Allow, pkgNamespace: string): { source: Source; ports: string[] } {
  const ports: string[] = [];
  if (rule.port !== undefined) ports.push(rule.port.toString());
  if (rule.ports) ports.push(...rule.ports.map(p => p.toString()));

  let source: Source = {};
  if (rule.remoteCidr) {
    source = { ipBlocks: [rule.remoteCidr] };
  } else if (
    rule.remoteNamespace === "" ||
    rule.remoteNamespace === "*" ||
    rule.remoteGenerated === RemoteGenerated.Anywhere
  ) {
    source = {};
  } else if (rule.remoteGenerated === RemoteGenerated.IntraNamespace) {
    source = { namespaces: [pkgNamespace] };
  } else if (rule.remoteNamespace && rule.remoteNamespace !== "" && rule.remoteNamespace !== "*") {
    source = { namespaces: [rule.remoteNamespace] };
  } else {
    source = {};
  }
  if (rule.remoteServiceAccount && rule.remoteServiceAccount.trim() !== "") {
    const nsForSA =
      rule.remoteNamespace && rule.remoteNamespace.trim() !== ""
        ? rule.remoteNamespace
        : pkgNamespace;
    source = { principals: [`cluster.local/ns/${nsForSA}/sa/${rule.remoteServiceAccount}`] };
  }
  return { source, ports };
}

/**
 * Processes an Expose rule to extract its effective source and ports.
 */
function processExposeRule(rule: Expose): { source: Source; ports: string[] } {
  const ports: string[] = [];
  const effectivePort = rule.targetPort ?? rule.port;
  if (effectivePort !== undefined) {
    ports.push(effectivePort.toString());
  }
  const source =
    rule.gateway === Gateway.Admin
      ? { principals: [ADMIN_INGRESS] }
      : { principals: [TENANT_INGRESS] };
  return { source, ports };
}

/**
 * Helper to determine if an object is empty.
 */
function isEmpty(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Helper to build an AuthorizationPolicy from rule details.
 * If the computed source is empty, the "from" field is omitted.
 */
function buildAuthPolicy(
  pkgName: string,
  pkgNamespace: string,
  generation: string,
  rule: Allow | Expose,
  source: Source,
  ports: string[],
): AuthorizationPolicy {
  const policyName = `protect-${pkgName}-${generateAuthPolName(rule)}`;
  const ruleEntry: Rule = {};
  if (!isEmpty(source)) {
    ruleEntry.from = [{ source }];
  }
  if (ports.length > 0) {
    ruleEntry.to = [{ operation: { ports } }];
  }
  return {
    apiVersion: "security.istio.io/v1beta1",
    kind: "AuthorizationPolicy",
    metadata: {
      name: policyName,
      namespace: pkgNamespace,
      labels: { "uds/package": pkgName, "uds/generation": generation },
    },
    spec: {
      action: Action.Allow,
      ...(rule.selector ? { selector: { matchLabels: rule.selector } } : {}),
      rules: [ruleEntry],
    },
  };
}

/**
 * Helper to generate a monitor AuthorizationPolicy.
 */
function buildMonitorAuthPolicy(
  pkgName: string,
  pkgNamespace: string,
  generation: string,
  monitor: Monitor,
): AuthorizationPolicy {
  const mSelector = monitor.podSelector ?? monitor.selector;
  const monitorRule: Rule = {
    from: [{ source: { namespaces: ["monitoring"] } }],
    to: [{ operation: { ports: [monitor.targetPort.toString()] } }],
  };
  const monitorPolicyName = `protect-${pkgName}-monitor-${derivePolicyName(mSelector)}-${monitor.targetPort}`;
  return {
    apiVersion: "security.istio.io/v1beta1",
    kind: "AuthorizationPolicy",
    metadata: {
      name: monitorPolicyName,
      namespace: pkgNamespace,
      labels: { "uds/package": pkgName, "uds/generation": generation },
    },
    spec: {
      action: Action.Allow,
      selector: { matchLabels: mSelector },
      rules: [monitorRule],
    },
  };
}

/**
 * Generate and apply Istio Authorization Policies for a given UDSPackage.
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

  const policies: AuthorizationPolicy[] = [];

  // Process allow rules.
  if (pkg.spec?.network?.allow) {
    for (const rule of pkg.spec.network.allow) {
      if (rule.direction === "Egress") continue;
      const { source, ports } = processAllowRule(rule, pkgNamespace);
      const authPolicy = buildAuthPolicy(pkgName, pkgNamespace, generation, rule, source, ports);
      policies.push(authPolicy);
      log.debug(`Generated authpol: ${authPolicy.metadata?.name}`);
    }
  }

  // Process expose rules.
  if (pkg.spec?.network?.expose) {
    for (const rule of pkg.spec.network.expose) {
      const { source, ports } = processExposeRule(rule);
      const authPolicy = buildAuthPolicy(pkgName, pkgNamespace, generation, rule, source, ports);
      policies.push(authPolicy);
      log.debug(`Generated authpol: ${authPolicy.metadata?.name}`);
    }
  }

  // Process monitor rules.
  if (pkg.spec?.monitor) {
    for (const monitor of pkg.spec.monitor) {
      const authPolicy = buildMonitorAuthPolicy(pkgName, pkgNamespace, generation, monitor);
      policies.push(authPolicy);
      log.debug(`Generated monitor authpol: ${authPolicy.metadata?.name}`);
    }
  }

  // Apply policies concurrently.
  await Promise.all(
    policies.map(async policy => {
      try {
        await K8s(AuthorizationPolicy).Apply(policy, { force: true });
        log.info(
          `Applied AuthorizationPolicy ${policy.metadata?.name} in namespace ${policy.metadata?.namespace}`,
        );
      } catch (err) {
        log.error(
          err,
          `Error applying AuthorizationPolicy ${policy.metadata?.name} in namespace ${policy.metadata?.namespace}`,
        );
      }
    }),
  );

  await purgeOrphans(generation, pkgNamespace, pkgName, AuthorizationPolicy, log);
  return policies;
}
