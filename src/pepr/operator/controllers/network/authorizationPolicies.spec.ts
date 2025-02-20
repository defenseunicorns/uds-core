/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction, UDSPackage } from "../../crd";
import { generateAuthorizationPolicies } from "./policies";

describe("generateAuthorizationPolicies", () => {
  test("returns empty array if no valid network rules exist", () => {
    const cases = [
      { spec: { network: {} }, metadata: { name: "test", generation: 1 } }, // No network key
      { spec: { network: { allow: [] } }, metadata: { name: "test", generation: 1 } }, // Empty allow array
    ];

    for (const pkg of cases) {
      expect(generateAuthorizationPolicies(pkg as UDSPackage, "test-namespace")).toEqual([]);
    }
  });

  test("creates DENY policies for each unique selector and includes only matching rules", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-1",
              direction: Direction.Ingress,
              selector: { app: "frontend" },
            },
            {
              remoteNamespace: "external-2",
              direction: Direction.Ingress,
              selector: { app: "backend" },
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result.length).toBeGreaterThanOrEqual(2);

    const selectorRules = result.map(policy => policy.metadata?.name);
    expect(new Set(selectorRules).size).toBe(selectorRules.length); // Ensure unique selectors

    expect(
      result.some(policy =>
        policy.spec?.rules?.some(rule =>
          rule.from?.some(from => from.source?.notNamespaces?.includes("external-2")),
        ),
      ),
    ).toBeTruthy();
  });

  test("ensures policies have correct labels", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [{ remoteNamespace: "external-ns", direction: Direction.Ingress }],
        },
      },
      metadata: { name: "test", generation: 2 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result.length).toBeGreaterThanOrEqual(1);

    expect(result[0]?.metadata?.labels).toEqual({
      "uds/package": "test",
      "uds/generation": "2",
    });
  });

  test("skips AuthorizationPolicy when only egress rules exist", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            { remoteNamespace: "external-1", direction: Direction.Egress },
            { remoteNamespace: "external-2", port: 8080, direction: Direction.Egress },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");
    expect(result).toEqual([]);
  });

  test("ensures namespace-wide deny policies handle global deny rules correctly", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            { remoteNamespace: "external-1", direction: Direction.Ingress, port: 8080 },
            { remoteNamespace: "external-2", direction: Direction.Ingress },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(
      result.some(policy =>
        policy.spec?.rules?.some(rule =>
          rule.to?.some(to => to.operation?.ports?.includes("8080")),
        ),
      ),
    ).toBeTruthy();

    expect(
      result.some(policy =>
        policy.spec?.rules?.some(rule => rule.to?.some(to => to.operation?.notPorts)),
      ),
    ).toBeTruthy();
  });

  test("ensures generated policies have unique names", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-1",
              direction: Direction.Ingress,
              selector: { app: "frontend" },
            },
            {
              remoteNamespace: "external-1",
              direction: Direction.Ingress,
              selector: { app: "backend" },
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result.length).toBeGreaterThanOrEqual(2);

    const policyNames = result.map(policy => policy.metadata?.name);
    expect(new Set(policyNames).size).toBe(policyNames.length); // Ensure no duplicates
  });

  test("handles rules with no selector correctly", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            { remoteNamespace: "external-1", direction: Direction.Ingress }, // No selector
            {
              remoteNamespace: "external-2",
              direction: Direction.Ingress,
              selector: { app: "backend" },
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result.length).toBeGreaterThanOrEqual(1);

    expect(result.some(policy => policy.metadata?.name?.includes("no-selector"))).toBeTruthy();

    expect(
      result.some(policy =>
        policy.spec?.rules?.some(rule =>
          rule.from?.some(from => from.source?.notNamespaces?.includes("external-1")),
        ),
      ),
    ).toBeTruthy();
  });
});
