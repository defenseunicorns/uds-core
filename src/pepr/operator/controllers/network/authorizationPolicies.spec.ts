/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction, IstioAuthorizationPolicy, UDSPackage } from "../../crd";
import { generateAuthorizationPolicies } from "./policies";

describe("generateAuthorizationPolicies", () => {
  test.concurrent("returns empty array if no network rules exist", () => {
    const pkg: UDSPackage = {
      spec: { network: {} },
      metadata: { name: "test", generation: 1 },
    };
    const result = generateAuthorizationPolicies(pkg, "test-namespace");
    expect(result).toEqual([]);
  });

  test.concurrent("returns empty array if allow rules are empty", () => {
    const pkg: UDSPackage = {
      spec: { network: { allow: [] } },
      metadata: { name: "test", generation: 1 },
    };
    const result = generateAuthorizationPolicies(pkg, "test-namespace");
    expect(result).toEqual([]);
  });

  test.concurrent("creates a single DENY policy with namespace restriction per port", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-1",
              port: 8080,
              direction: Direction.Egress,
            },
            {
              remoteNamespace: "external-2",
              port: 3100,
              direction: Direction.Egress,
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(IstioAuthorizationPolicy);
    expect(result[0].spec?.rules).toEqual([
      {
        from: [{ source: { notNamespaces: ["external-1"] } }],
        to: [{ operation: { ports: ["8080"] } }],
      },
      {
        from: [{ source: { notNamespaces: ["external-2"] } }],
        to: [{ operation: { ports: ["3100"] } }],
      },
    ]);
  });

  test.concurrent("correctly aggregates multiple notNamespace entries for the same port", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-1",
              port: 8080,
              direction: Direction.Egress,
            },
            {
              remoteNamespace: "external-2",
              port: 8080,
              direction: Direction.Egress,
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result).toHaveLength(1);
    expect(result[0].spec?.rules).toEqual([
      {
        from: [{ source: { notNamespaces: ["external-1", "external-2"] } }],
        to: [{ operation: { ports: ["8080"] } }],
      },
    ]);
  });

  test.concurrent("applies correct metadata and labels", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-ns",
              port: 8080,
              direction: Direction.Egress,
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result[0].metadata?.name).toContain("deny-test");
    expect(result[0].metadata?.namespace).toBe("test-namespace");
    expect(result[0].metadata?.labels).toHaveProperty("uds/package", "test");
    expect(result[0].metadata?.labels).toHaveProperty("uds/generation", "1");
  });

  test.concurrent("handles missing remoteNamespace and remoteServiceAccount", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              port: 8080,
              direction: Direction.Egress,
            },
          ], // No remoteNamespace or remoteServiceAccount
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result).toEqual([]); // Should not generate a policy without valid deny rules
  });

  test.concurrent("skips AuthorizationPolicy when only allow-all rules exist", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-3",
              direction: Direction.Egress,
            },
          ], // No port defined = allow all
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result).toEqual([]); // Should not generate an AuthorizationPolicy
  });

  test.concurrent(
    "adds wildcard blocked namespaces to all existing deny rules when per-port denies exist",
    () => {
      const pkg: UDSPackage = {
        spec: {
          network: {
            allow: [
              {
                remoteNamespace: "external-1",
                port: 8080,
                direction: Direction.Egress,
              },
              {
                remoteNamespace: "external-2",
                port: 3100,
                direction: Direction.Egress,
              },
              {
                remoteNamespace: "external-3",
                direction: Direction.Egress,
              }, // Blocks all ports, should apply to all per-port rules
            ],
          },
        },
        metadata: { name: "test", generation: 1 },
      };

      const result = generateAuthorizationPolicies(pkg, "test-namespace");

      expect(result).toHaveLength(1);
      expect(result[0].spec?.rules).toEqual([
        {
          from: [{ source: { notNamespaces: ["external-1", "external-3"] } }],
          to: [{ operation: { ports: ["8080"] } }],
        },
        {
          from: [{ source: { notNamespaces: ["external-2", "external-3"] } }],
          to: [{ operation: { ports: ["3100"] } }],
        },
        {
          from: [{ source: { notNamespaces: ["external-3"] } }],
          to: [{ operation: { notPorts: ["8080", "3100"] } }], // Blocks all ports *except* the explicitly denied ones
        },
      ]);
    },
  );

  test.concurrent("does not create a DENY policy if there are no valid allow rules", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [], // Empty object, treated as an invalid allow rule
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result).toEqual([]); // Should not create a deny policy
  });

  test.concurrent("correctly handles both namespace and service account restrictions", () => {
    const pkg: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "external-1",
              remoteServiceAccount: "sa-1",
              port: 8080,
              direction: Direction.Egress,
            },
          ],
        },
      },
      metadata: { name: "test", generation: 1 },
    };

    const result = generateAuthorizationPolicies(pkg, "test-namespace");

    expect(result).toHaveLength(1);
    expect(result[0].spec?.rules).toEqual([
      {
        from: [
          {
            source: {
              notNamespaces: ["external-1"],
              notPrincipals: ["cluster.local/ns/external-1/sa/sa-1"],
            },
          },
        ],
        to: [{ operation: { ports: ["8080"] } }],
      },
    ]);
  });

  test.concurrent("handles multiple packages in a namespace correctly", () => {
    const pkg1: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "frontend",
              port: 8080,
              direction: Direction.Egress,
            },
          ],
        },
      },
      metadata: { name: "pkg1", generation: 1 },
    };

    const pkg2: UDSPackage = {
      spec: {
        network: {
          allow: [
            {
              remoteNamespace: "backend",
              port: 3100,
              direction: Direction.Egress,
            },
          ],
        },
      },
      metadata: { name: "pkg2", generation: 2 },
    };

    const result1 = generateAuthorizationPolicies(pkg1, "test-namespace");
    const result2 = generateAuthorizationPolicies(pkg2, "test-namespace");

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(1);

    expect(result1[0].spec?.rules).toEqual([
      {
        from: [{ source: { notNamespaces: ["frontend"] } }],
        to: [{ operation: { ports: ["8080"] } }],
      },
    ]);

    expect(result2[0].spec?.rules).toEqual([
      {
        from: [{ source: { notNamespaces: ["backend"] } }],
        to: [{ operation: { ports: ["3100"] } }],
      },
    ]);
  });
});
