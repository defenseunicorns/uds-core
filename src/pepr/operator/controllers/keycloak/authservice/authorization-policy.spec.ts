/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  authNRequestAuthentication,
  authserviceAuthorizationPolicy,
  jwtAuthZAuthorizationPolicy,
  UDSConfig,
  computeMonitorExemptions,
} from "./authorization-policy";
import type { UDSPackage } from "../../../crd";
import type {
  Rule as IstioRule,
  To as IstioTo,
  Operation as IstioOperation,
} from "../../../crd/generated/istio/authorizationpolicy-v1beta1";

// Patch UDSConfig for deterministic output
beforeAll(() => {
  UDSConfig.domain = "example.com";
});

const labelSelector = { app: "test-app" };
const name = "my-app";
const namespace = "test-ns";
const waypointName = "my-waypoint";

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
    expect(Array.isArray(rule1.to)).toBe(true);
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
    expect(Array.isArray(rule2.to)).toBe(true);
    expect((rule2.to ?? []).length).toBe(0);
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

  it("ambient jwtAuthZ policy includes only monitor 'to' exclusions (no base)", () => {
    const pol = jwtAuthZAuthorizationPolicy(labelSelector, name, namespace, true, waypointName, [
      { port: "8080", path: "/metrics" },
    ]);
    const rule = pol.spec!.rules?.[0] as IstioRule;
    expect(rule).toBeDefined();
    const toList = (rule.to ?? []) as IstioTo[];
    expect(Array.isArray(toList)).toBe(true);
    expect(toList.length).toBe(2);
    const ops = toList.map(t => t.operation as IstioOperation);
    const hasPerPort = ops.some(
      op =>
        Array.isArray(op.ports) &&
        op.ports!.includes("8080") &&
        Array.isArray(op.notPaths) &&
        op.notPaths!.includes("/metrics"),
    );
    const hasCatchAll = ops.some(op => Array.isArray(op.notPorts) && op.notPorts!.includes("8080"));
    expect(hasPerPort).toBe(true);
    expect(hasCatchAll).toBe(true);
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

  it("non-ambient authservice policy has base (sidecar) per-port monitor entries and a catch-all", () => {
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
    const rule = pol.spec!.rules?.[0] as IstioRule;
    expect(rule).toBeDefined();
    const toList = (rule.to ?? []) as IstioTo[];
    expect(Array.isArray(toList)).toBe(true);
    // Expect per-port entries for each monitor, then a catch-all; first per-port should be 15020
    const baseOp = toList[0].operation as IstioOperation;
    expect(baseOp.ports).toEqual(expect.arrayContaining(["15020"]));
    expect(baseOp.notPaths).toEqual(expect.arrayContaining(["/stats/prometheus"]));
    const perPortOps = toList.slice(1, -1).map((e: IstioTo) => e.operation as IstioOperation);
    const has8080Metrics = perPortOps.some(
      op =>
        Array.isArray(op.ports) &&
        op.ports!.includes("8080") &&
        Array.isArray(op.notPaths) &&
        op.notPaths!.includes("/metrics"),
    );
    const has9090Custom = perPortOps.some(
      op =>
        Array.isArray(op.ports) &&
        op.ports!.includes("9090") &&
        Array.isArray(op.notPaths) &&
        op.notPaths!.includes("/custommetrics"),
    );
    expect(has8080Metrics).toBe(true);
    expect(has9090Custom).toBe(true);
    const catchAll = (toList[toList.length - 1].operation as IstioOperation).notPorts as string[];
    expect(catchAll).toEqual(expect.arrayContaining(["15020", "8080", "9090"]));
  });

  it("non-ambient jwtAuthZ policy has base (sidecar) per-port monitor entries and a catch-all", () => {
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
    const rule = pol.spec!.rules?.[0] as IstioRule;
    expect(rule).toBeDefined();
    const toList = (rule.to ?? []) as IstioTo[];
    expect(Array.isArray(toList)).toBe(true);
    const baseOp2 = toList[0].operation as IstioOperation;
    expect(baseOp2.ports).toEqual(expect.arrayContaining(["15020"]));
    expect(baseOp2.notPaths).toEqual(expect.arrayContaining(["/stats/prometheus"]));
    const perPortOps2 = toList.slice(1, -1).map((e: IstioTo) => e.operation as IstioOperation);
    const has8080Metrics2 = perPortOps2.some(
      op =>
        Array.isArray(op.ports) &&
        op.ports!.includes("8080") &&
        Array.isArray(op.notPaths) &&
        op.notPaths!.includes("/metrics"),
    );
    expect(has8080Metrics2).toBe(true);
    const catchAll2 = (toList[toList.length - 1].operation as IstioOperation).notPorts as string[];
    expect(catchAll2).toEqual(expect.arrayContaining(["15020", "8080"]));
  });

  it("ambient authservice policy includes only per-port and catch-all entries (no base)", () => {
    const pol = authserviceAuthorizationPolicy(labelSelector, name, namespace, true, waypointName, [
      { port: "8080", path: "/metrics" },
    ]);
    const rule = pol.spec!.rules?.[0] as IstioRule;
    expect(rule).toBeDefined();
    const toList = (rule.to ?? []) as IstioTo[];
    expect(Array.isArray(toList)).toBe(true);
    expect(toList.length).toBe(2);
    const ops = toList.map(t => t.operation as IstioOperation);
    const hasPerPort = ops.some(
      op =>
        Array.isArray(op.ports) &&
        op.ports!.includes("8080") &&
        Array.isArray(op.notPaths) &&
        op.notPaths!.includes("/metrics"),
    );
    const hasCatchAll = ops.some(op => Array.isArray(op.notPorts) && op.notPorts!.includes("8080"));
    expect(hasPerPort).toBe(true);
    expect(hasCatchAll).toBe(true);
  });
});
