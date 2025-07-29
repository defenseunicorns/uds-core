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
} from "./authorization-policy";

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
});
