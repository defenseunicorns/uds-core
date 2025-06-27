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
import { IstioState } from "../istio/namespace";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";
import { META_IP } from "./generators/cloudMetadata";
import { kubeAPI } from "./generators/kubeAPI";
import { kubeNodes } from "./generators/kubeNodes";

const log = setupLogger(Component.OPERATOR_NETWORK);

// Constants for gateway principals.
const ADMIN_INGRESS = "cluster.local/ns/istio-admin-gateway/sa/admin-ingressgateway";
const TENANT_INGRESS = "cluster.local/ns/istio-tenant-gateway/sa/tenant-ingressgateway";
const PASSTHROUGH_INGRESS =
  "cluster.local/ns/istio-passthrough-gateway/sa/passthrough-ingressgateway";
const PROMETHEUS_PRINCIPAL = "cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus";

/**
 * Generates a unique name for a Monitor rule.
 * Combines the target port and a derived name from the pod selector or fallback selector.
 * Prioritizes "app" or "app.kubernetes.io/name" label values to form a stable, readable base.
 * Falls back to joining all selector values, or "workload" if none exist.
 */
function generateMonitorName(monitor: Monitor): string {
  const selector = monitor.podSelector ?? monitor.selector ?? {};
  const portPart = monitor.targetPort?.toString() ?? "unknown-port";
  const baseName =
    selector["app"]?.replace(/-pod$/, "") ??
    (selector["app.kubernetes.io/name"]
      ? selector["app.kubernetes.io/name"].replace(/-pod$/, "") + "-workload"
      : undefined) ??
    (Object.values(selector).join("-") || "workload");
  return `monitor-${portPart}-${baseName}`;
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
  return `ingress-${baseName}`;
}

/**
 * Generates a unique name for an Expose rule using effective port, selector, and gateway.
 */
function generateExposeName(rule: Expose): string {
  const effectivePort = rule.targetPort ?? rule.port;
  const selPart = rule.selector ? Object.values(rule.selector).join("-") : "all";
  const gateway = rule.gateway || "tenant";
  return `ingress-${effectivePort}-${selPart}-istio-${gateway}-gateway`;
}

/**
 * Processes an Allow rule to extract its effective source and ports.
 */
function processAllowRule(rule: Allow, pkgNamespace: string): { source: Source; ports: string[] } {
  const ports: string[] = [];
  if (rule.port !== undefined) ports.push(rule.port.toString());
  if (rule.ports) ports.push(...rule.ports.map(p => p.toString()));

  let source: Source = {};

  const hasRemoteSA = rule.remoteServiceAccount?.trim();
  const hasRemoteNS = rule.remoteNamespace?.trim();

  if (hasRemoteSA) {
    const ns = hasRemoteNS || pkgNamespace;
    source = {
      principals: [`cluster.local/ns/${ns}/sa/${rule.remoteServiceAccount}`],
    };
  } else if (rule.remoteCidr) {
    source = { ipBlocks: [rule.remoteCidr] };
  } else if (rule.remoteGenerated) {
    switch (rule.remoteGenerated) {
      case RemoteGenerated.CloudMetadata:
        source = { ipBlocks: [META_IP] };
        break;
      case RemoteGenerated.KubeAPI:
        source = {
          ipBlocks: kubeAPI()
            .map((peer: { ipBlock?: { cidr: string } }) => peer.ipBlock?.cidr)
            .filter((cidr): cidr is string => typeof cidr === "string"),
        };
        break;
      case RemoteGenerated.KubeNodes:
        source = {
          ipBlocks: kubeNodes()
            .map((peer: { ipBlock?: { cidr: string } }) => peer.ipBlock?.cidr)
            .filter((cidr): cidr is string => typeof cidr === "string"),
        };
        break;
      case RemoteGenerated.IntraNamespace:
        source = { namespaces: [pkgNamespace] };
        break;
      case RemoteGenerated.Anywhere:
        source = {};
        break;
    }
  } else if (rule.remoteNamespace === "" || rule.remoteNamespace === "*") {
    source = {};
  } else if (rule.remoteNamespace) {
    source = { namespaces: [rule.remoteNamespace] };
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
      : rule.gateway === Gateway.Passthrough
        ? { principals: [PASSTHROUGH_INGRESS] }
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
  policyName: string,
  pkg: UDSPackage,
  selector: Record<string, string> | undefined,
  source: Source,
  ports: string[],
  additionalLabels?: Record<string, string>,
): AuthorizationPolicy {
  const ruleEntry: Rule = {};
  if (!isEmpty(source)) {
    ruleEntry.from = [{ source }];
  }
  if (ports.length > 0) {
    ruleEntry.to = [{ operation: { ports } }];
  }

  const pkgName = pkg.metadata?.name ?? "unknown";
  const pkgNamespace = pkg.metadata?.namespace ?? "default";
  const generation = pkg.metadata?.generation?.toString() ?? "0";

  return {
    apiVersion: "security.istio.io/v1beta1",
    kind: "AuthorizationPolicy",
    metadata: {
      name: policyName,
      namespace: pkgNamespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
        "uds/for": "network",
        ...additionalLabels,
      },
      ownerReferences: getOwnerRef(pkg),
    },
    spec: {
      action: Action.Allow,
      ...(selector ? { selector: { matchLabels: selector } } : {}),
      rules: [ruleEntry],
    },
  };
}

/**
 * Generate and apply Istio Authorization Policies for a given UDSPackage.
 */
export async function generateAuthorizationPolicies(
  pkg: UDSPackage,
  pkgNamespace: string,
  istioMode: string,
): Promise<AuthorizationPolicy[]> {
  const pkgName = pkg.metadata?.name ?? "unknown";
  const generation = pkg.metadata?.generation?.toString() ?? "0";
  log.info(
    `Starting authorization policy generation for package "${pkgName}" in namespace "${pkgNamespace}" (generation ${generation}).`,
  );

  const policies: AuthorizationPolicy[] = [];

  // Process allow rules.
  if (pkg.spec?.network?.allow) {
    for (const rule of pkg.spec.network.allow) {
      if (rule.direction === "Egress") continue;
      const { source, ports } = processAllowRule(rule, pkgNamespace);
      const policyName = sanitizeResourceName(`protect-${pkgName}-${generateAllowName(rule)}`);
      const additionalLabels: Record<string, string> | undefined = rule.remoteGenerated
        ? { "uds/generated": rule.remoteGenerated }
        : undefined;
      const authPolicy = buildAuthPolicy(
        policyName,
        pkg,
        rule.selector,
        source,
        ports,
        additionalLabels,
      );
      policies.push(authPolicy);
      log.trace(`Generated authpol: ${authPolicy.metadata?.name}`);
    }
  }

  // Process expose rules.
  if (pkg.spec?.network?.expose) {
    for (const rule of pkg.spec.network.expose) {
      const { source, ports } = processExposeRule(rule);
      const policyName = sanitizeResourceName(`protect-${pkgName}-${generateExposeName(rule)}`);
      const authPolicy = buildAuthPolicy(policyName, pkg, rule.selector, source, ports);
      policies.push(authPolicy);
      log.trace(`Generated authpol: ${authPolicy.metadata?.name}`);
    }
  }

  // Process monitor rules.
  if (pkg.spec?.monitor) {
    for (const monitor of pkg.spec.monitor) {
      const selector = monitor.podSelector ?? monitor.selector;
      const source: Source = { principals: [PROMETHEUS_PRINCIPAL] };
      const ports: string[] = [monitor.targetPort.toString()];
      const policyName = sanitizeResourceName(`protect-${pkgName}-${generateMonitorName(monitor)}`);
      const authPolicy = buildAuthPolicy(policyName, pkg, selector, source, ports);
      policies.push(authPolicy);
      log.trace(`Generated monitor authpol: ${authPolicy.metadata?.name}`);
    }
  }

  // With Prometheus in Ambient mode, all traffic is sent over mTLS and the
  // destination sidecar requires an ALLOW policy to expose sidecar metrics.
  // Add an AuthorizationPolicy to allow all traffic on port 15020 for the package's namespace.
  if (istioMode === IstioState.Sidecar) {
    const extraPolicyName = sanitizeResourceName(
      `protect-${pkgName}-ingress-15020-sidecar-metric-scraping`,
    );
    const extraPolicy = buildAuthPolicy(
      extraPolicyName,
      pkg,
      {}, // empty selector to apply to all workloads in the namespace
      { principals: [PROMETHEUS_PRINCIPAL] },
      ["15020"],
    );
    policies.push(extraPolicy);
    log.trace(
      `Generated extra ambient allow authpol for port 15020: ${extraPolicy.metadata?.name}`,
    );
  }

  // Apply policies concurrently.
  for (const policy of policies) {
    try {
      await K8s(AuthorizationPolicy).Apply(policy, { force: true });
      log.trace(
        `Applied AuthorizationPolicy ${policy.metadata?.name} in namespace ${policy.metadata?.namespace}`,
      );
    } catch (err) {
      log.error(
        err,
        `Error applying AuthorizationPolicy ${policy.metadata?.name} in namespace ${policy.metadata?.namespace}`,
      );
      throw err; // Rethrow to fail the reconciliation process.
    }
  }

  await purgeOrphans(generation, pkgNamespace, pkgName, AuthorizationPolicy, log, {
    "uds/for": "network",
  });

  return policies;
}
