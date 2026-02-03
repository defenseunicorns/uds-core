/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns
 */

import { beforeAll, describe, expect, it } from "vitest";
import type {
  Operation as IstioOperation,
  Rule as IstioRule,
  To as IstioTo,
} from "../../../crd/generated/istio/authorizationpolicy-v1beta1.js";
import type { UDSPackage } from "../../../crd/index.js";
import { PROMETHEUS_PRINCIPAL } from "../../utils.js";
import {
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  computeMonitorExemptions,
  jwtAuthZAuthorizationPolicy,
  UDSConfig,
} from "./authorization-policy.js";

// Patch UDSConfig for deterministic output
beforeAll(() => {
  UDSConfig.domain = "example.com";
});

const labelSelector = { app: "test-app" };
const name = "my-app";
const namespace = "test-ns";
const waypointName = "my-waypoint";

function collectOperations(rules: IstioRule[]): IstioOperation[] {
  return rules.flatMap(r => (r.to ?? []) as IstioTo[]).map(t => t.operation as IstioOperation);
}

function splitMetricsAndNonMetrics(ops: IstioOperation[]) {
  const metricsOps = ops.filter(op => Array.isArray(op.paths));
  const nonMetricsOps = ops.filter(op => Array.isArray(op.notPaths) || Array.isArray(op.notPorts));
  return { metricsOps, nonMetricsOps };
}

function collectCatchAllPorts(nonMetricsOps: IstioOperation[]): string[] {
  return nonMetricsOps.filter(op => Array.isArray(op.notPorts)).flatMap(op => op.notPorts ?? []);
}

function expectHasNonMetricExclusion(ops: IstioOperation[], port: string, path: string) {
  expect(ops.some(op => op.ports?.includes(port) && op.notPaths?.includes(path))).toBe(true);
}

describe("authorization-policy.ts", () => {
  it("sets selector for non-ambient authservice policy", () => {
    const pol = authserviceAuthorizationPolicy(labelSelector, name, namespace, false);
    expect(pol.spec).toBeDefined();
    expect(pol.spec!.selector).toEqual({ matchLabels: labelSelector });
    expect(pol.spec!.targetRef).toBeUndefined();
  });

  it("ambient policies with no monitors produce empty 'to'", () => {
    const pol1 = authserviceAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      true,
      waypointName,
      [],
    );
    const rule1 = pol1.spec!.rules?.[0] as IstioRule;
    expect((rule1.to ?? []).length).toBe(0);

    const pol2 = jwtAuthZAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      true,
      waypointName,
      [],
    );
    const rule2 = pol2.spec!.rules?.[0] as IstioRule;
    expect((rule2.to ?? []).length).toBe(0);
  });

  it("authservice policy with monitor exemptions only includes non-metrics operations", () => {
    const monitorExemptions = [{ port: "8080", path: "/metrics" }];
    const pol = authserviceAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      false,
      undefined,
      monitorExemptions,
    );

    const rules = (pol.spec!.rules ?? []) as IstioRule[];
    expect(rules.length).toBe(1);

    const allOps = collectOperations(rules);
    const { metricsOps, nonMetricsOps } = splitMetricsAndNonMetrics(allOps);

    // Authservice CUSTOM policy does not target metrics endpoints when monitor exemptions are present
    expect(metricsOps.length).toBe(0);
    expect(nonMetricsOps.length).toBeGreaterThan(0);

    const nonMetricsRule = rules[0];
    expect(nonMetricsRule.from).toBeUndefined();
    expect(nonMetricsRule.when).toBeDefined();
  });

  it("computeMonitorExemptions excludes non-matching monitors", () => {
    const pkg = {
      spec: {
        monitor: [
          { selector: { app: "other" }, portName: "http", targetPort: 8081, path: "/metrics" },
        ],
      },
    } as unknown as UDSPackage;

    const ex = computeMonitorExemptions(pkg, labelSelector);
    expect(ex).toEqual([]);

    // Sidecar policy with no matching monitors should have no 'to' entries when called directly
    const sidecarPol = authserviceAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      false,
      undefined,
      ex,
    );
    const sidecarRule = sidecarPol.spec!.rules?.[0] as IstioRule;
    const toList = (sidecarRule.to ?? []) as IstioTo[];
    expect(toList.length).toBe(0);
  });

  it("computeMonitorExemptions includes matching monitors", () => {
    const pkg = {
      spec: {
        monitor: [
          {
            selector: labelSelector,
            portName: "http",
            targetPort: 8081,
            path: "/metrics",
          },
        ],
      },
    } as unknown as UDSPackage;

    const ex = computeMonitorExemptions(pkg, labelSelector);
    expect(ex).toEqual([{ port: "8081", path: "/metrics" }]);

    // Sidecar policy with matching monitors should produce non-empty 'to' entries
    const sidecarPol = authserviceAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      false,
      undefined,
      ex,
    );
    const sidecarRule = sidecarPol.spec!.rules?.[0] as IstioRule;
    const toList = (sidecarRule.to ?? []) as IstioTo[];
    expect(toList.length).toBeGreaterThan(0);
  });

  it("ambient jwtAuthZ policy builds separate metrics and non-metrics rules from monitor exemptions", () => {
    const pol = jwtAuthZAuthorizationPolicy(labelSelector, name, namespace, true, waypointName, [
      { port: "8080", path: "/metrics" },
    ]);

    const rules = (pol.spec!.rules ?? []) as IstioRule[];
    expect(rules.length).toBe(2);

    const metricsRule = rules[0];
    const nonMetricsRule = rules[1];

    // Metrics rule: should target only the metrics endpoint with ports+paths
    const metricsTo = (metricsRule.to ?? []) as IstioTo[];
    expect(metricsTo.length).toBe(1);
    const metricsOp = metricsTo[0].operation as IstioOperation;
    expect(metricsOp.ports).toEqual(["8080"]);
    expect(metricsOp.paths).toEqual(["/metrics"]);

    // Non-metrics rule: should have per-port notPaths and a catch-all notPorts
    const nonMetricsTo = (nonMetricsRule.to ?? []) as IstioTo[];
    expect(nonMetricsTo.length).toBe(2);
    const nonOps = nonMetricsTo.map(t => t.operation as IstioOperation);
    const perPort = nonOps.find(op => Array.isArray(op.ports) && op.ports!.includes("8080"));
    expect(perPort?.notPaths).toEqual(expect.arrayContaining(["/metrics"]));
    const catchAll = nonOps.find(op => Array.isArray(op.notPorts) && op.notPorts!.includes("8080"));
    expect(catchAll).toBeDefined();
  });

  it("sets targetRef for ambient authservice policy", () => {
    const pol = authserviceAuthorizationPolicy(labelSelector, name, namespace, true, waypointName);
    expect(pol.spec).toBeDefined();
    expect(pol.spec!.targetRef).toEqual({
      group: "gateway.networking.k8s.io",
      kind: "Gateway",
      name: waypointName,
    });
    expect(pol.spec!.selector).toBeUndefined();
  });

  it("sets selector for non-ambient jwtAuthZ policy", () => {
    const pol = jwtAuthZAuthorizationPolicy(labelSelector, name, namespace, false);
    expect(pol.spec).toBeDefined();
    expect(pol.spec!.selector).toEqual({ matchLabels: labelSelector });
    expect(pol.spec!.targetRef).toBeUndefined();
  });

  it("sets targetRef for ambient jwtAuthZ policy", () => {
    const pol = jwtAuthZAuthorizationPolicy(labelSelector, name, namespace, true, waypointName);
    expect(pol.spec).toBeDefined();
    expect(pol.spec!.targetRef).toEqual({
      group: "gateway.networking.k8s.io",
      kind: "Gateway",
      name: waypointName,
    });
    expect(pol.spec!.selector).toBeUndefined();
  });

  it("sets selector for non-ambient RequestAuthentication", () => {
    const pol = authNRequestAuthentication(labelSelector, name, namespace, false);
    expect(pol.spec).toBeDefined();
    expect(pol.spec!.selector).toEqual({ matchLabels: labelSelector });
    expect(pol.spec!.targetRef).toBeUndefined();
  });

  it("sets targetRef for ambient RequestAuthentication", () => {
    const pol = authNRequestAuthentication(labelSelector, name, namespace, true, waypointName);
    expect(pol.spec).toBeDefined();
    expect(pol.spec!.targetRef).toEqual({
      group: "gateway.networking.k8s.io",
      kind: "Gateway",
      name: waypointName,
    });
    expect(pol.spec!.selector).toBeUndefined();
  });

  it("non-ambient authservice policy builds non-metrics operations from monitor exemptions", () => {
    const monitorExemptions = [
      { port: "15020", path: "/stats/prometheus" },
      { port: "8080", path: "/metrics" },
      { port: "9090", path: "/custommetrics" },
    ];
    const pol = authserviceAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      false,
      undefined,
      monitorExemptions,
    );

    const rules = (pol.spec!.rules ?? []) as IstioRule[];
    expect(rules.length).toBe(1);

    const allOps = collectOperations(rules);
    const { metricsOps, nonMetricsOps } = splitMetricsAndNonMetrics(allOps);
    // Authservice CUSTOM policy does not contain metrics operations
    expect(metricsOps.length).toBe(0);

    // Non-metrics ops: per-port notPaths plus catch-all notPorts
    const perPortNonMetrics = nonMetricsOps.filter(op => Array.isArray(op.ports));
    expectHasNonMetricExclusion(perPortNonMetrics, "15020", "/stats/prometheus");
    expectHasNonMetricExclusion(perPortNonMetrics, "8080", "/metrics");
    expectHasNonMetricExclusion(perPortNonMetrics, "9090", "/custommetrics");

    const catchAllPorts = collectCatchAllPorts(nonMetricsOps);
    expect(catchAllPorts).toEqual(expect.arrayContaining(["15020", "8080", "9090"]));
  });

  it("non-ambient jwtAuthZ policy builds metrics and non-metrics operations from monitor exemptions", () => {
    const monitorExemptions = [
      { port: "15020", path: "/stats/prometheus" },
      { port: "8080", path: "/metrics" },
    ];
    const pol = jwtAuthZAuthorizationPolicy(
      labelSelector,
      name,
      namespace,
      false,
      undefined,
      monitorExemptions,
    );

    const rules = (pol.spec!.rules ?? []) as IstioRule[];
    expect(rules.length).toBe(2);

    const metricsRule = rules[0];
    const nonMetricsRule = rules[1];

    // Metrics rule: deny for non-Prometheus callers without a valid UDS JWT
    const metricsFrom = metricsRule.from?.[0].source as {
      notPrincipals?: string[];
      notRequestPrincipals?: string[];
    };
    expect(metricsFrom.notPrincipals).toEqual([PROMETHEUS_PRINCIPAL]);
    expect(metricsFrom.notRequestPrincipals).toEqual(["https://sso.example.com/realms/uds/*"]);

    // Non-metrics rule: deny for callers without a valid UDS JWT, regardless of principal
    const nonMetricsFrom = nonMetricsRule.from?.[0].source as {
      notPrincipals?: string[];
      notRequestPrincipals?: string[];
    };
    expect(nonMetricsFrom.notPrincipals).toBeUndefined();
    expect(nonMetricsFrom.notRequestPrincipals).toEqual(["https://sso.example.com/realms/uds/*"]);
  });

  it("ambient authservice policy builds non-metrics operations from monitor exemptions", () => {
    const pol = authserviceAuthorizationPolicy(labelSelector, name, namespace, true, waypointName, [
      { port: "8080", path: "/metrics" },
    ]);

    const rules = (pol.spec!.rules ?? []) as IstioRule[];
    expect(rules.length).toBe(1);

    const allOps = collectOperations(rules);
    const { metricsOps, nonMetricsOps } = splitMetricsAndNonMetrics(allOps);
    // Authservice CUSTOM policy does not contain metrics operations in ambient mode
    expect(metricsOps.length).toBe(0);

    const perPortNonMetrics = nonMetricsOps.filter(op => Array.isArray(op.ports));
    expectHasNonMetricExclusion(perPortNonMetrics, "8080", "/metrics");

    const catchAllPorts = collectCatchAllPorts(nonMetricsOps);
    expect(catchAllPorts).toEqual(expect.arrayContaining(["8080"]));
  });
});
