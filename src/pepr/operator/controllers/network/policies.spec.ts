/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicy } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Gateway, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { findMatchingClient, networkPolicies } from "./policies";

// Mock dependencies
vi.mock("pepr", () => {
  const mockApply = vi.fn().mockResolvedValue({});
  return {
    K8s: vi.fn().mockImplementation(() => ({
      Apply: mockApply,
    })),
    kind: {
      NetworkPolicy: "NetworkPolicy",
    },
  };
});

vi.mock("../../../logger", () => ({
  setupLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  Component: {
    OPERATOR_NETWORK: "OPERATOR_NETWORK",
  },
}));

vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    getOwnerRef: vi.fn().mockReturnValue([{ kind: "UDSPackage", name: "test-pkg" }]),
    purgeOrphans: vi.fn().mockResolvedValue({}),
    retryWithDelay: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    sanitizeResourceName: vi.fn().mockImplementation(name => name),
  };
});

vi.mock("./defaults/default-deny-all", () => ({
  defaultDenyAll: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "default-deny-all",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./defaults/allow-egress-dns", () => ({
  allowEgressDNS: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-dns",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./defaults/allow-egress-istiod", () => ({
  allowEgressIstiod: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-istiod",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./defaults/allow-ingress-sidecar-monitoring", () => ({
  allowIngressSidecarMonitoring: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-ingress-sidecar-monitoring",
      namespace,
    },
    spec: {},
  })),
}));

describe("findMatchingClient", () => {
  it("should return undefined when podLabels is undefined", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {},
    };
    expect(findMatchingClient(pkg, undefined as unknown as Record<string, string>)).toBeUndefined();
  });

  it("should return undefined when podLabels is empty", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "test" },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, {})).toBeUndefined();
  });

  it("should return undefined when no SSO clients exist", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: { sso: [] },
    };
    expect(findMatchingClient(pkg, { app: "test" })).toBeUndefined();
  });

  it("should match client by single label", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "app1" },
            name: "",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "app2" },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "app1" })?.clientId).toBe("client1");
  });

  it("should match client by multiple labels", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: {
              app: "app1",
              "app.kubernetes.io/part-of": "test",
            },
            name: "",
          },
        ],
      },
    };
    expect(
      findMatchingClient(pkg, {
        app: "app1",
        "app.kubernetes.io/part-of": "test",
      })?.clientId,
    ).toBe("client1");
  });

  it("should not match when only some labels match", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: {
              app: "app1",
              "app.kubernetes.io/part-of": "test",
            },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "app1" })).toBeUndefined();
  });

  it("should match first client when multiple could match", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "app1" },
            name: "",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { app: "app1" },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "app1" })?.clientId).toBe("client1");
  });

  it("should match any pod when SSO client has empty selector", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: {},
            name: "empty-selector",
          },
        ],
      },
    };
    // Should match any pod, including empty labels
    expect(findMatchingClient(pkg, {})?.clientId).toBe("client1");
    // Should also match pods with labels
    expect(findMatchingClient(pkg, { app: "test" })?.clientId).toBe("client1");
  });

  it("should only match pods with empty string value when selector value is empty string", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { foo: "" },
            name: "",
          },
        ],
      },
    };
    // Should match only when the pod has foo: ""
    expect(findMatchingClient(pkg, { foo: "" })?.clientId).toBe("client1");
    expect(findMatchingClient(pkg, {})).toBeUndefined();
    expect(findMatchingClient(pkg, { foo: "bar" })).toBeUndefined();
  });

  it("should return undefined when SSO clients exist but none are authservice-enabled", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          { clientId: "a", name: "" }, // missing enableAuthserviceSelector
          { clientId: "c", name: "", enableAuthserviceSelector: undefined }, // undefined
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "anything" })).toBeUndefined();
  });

  it("should match when pod labels are a superset of selector labels", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [{ clientId: "client1", name: "", enableAuthserviceSelector: { app: "frontend" } }],
      },
    };
    expect(findMatchingClient(pkg, { app: "frontend", tier: "prod", extra: "x" })?.clientId).toBe(
      "client1",
    );
  });

  it("should skip non-enabled clients and still match an enabled one", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          { clientId: "disabled1", name: "" },
          { clientId: "disabled2", name: "", enableAuthserviceSelector: undefined },
          { clientId: "enabled", name: "", enableAuthserviceSelector: { app: "match" } },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "match" })?.clientId).toBe("enabled");
  });
});

describe("networkPolicies", () => {
  const mockPkg: UDSPackage = {
    apiVersion: "uds.dev/v1",
    kind: "UDSPackage",
    metadata: {
      name: "test-pkg",
      namespace: "test-ns",
      generation: 1,
      uid: "test-uid",
    },
    spec: {
      network: {
        expose: [
          {
            service: "frontend",
            host: "frontend.example.com",
            selector: { app: "frontend" },
            port: 8080,
            gateway: Gateway.Tenant,
          },
          {
            service: "backend",
            host: "backend.example.com",
            selector: { app: "backend" },
            port: 8080, // Same port as frontend
            gateway: Gateway.Tenant,
          },
          {
            service: "api",
            host: "api.example.com",
            selector: { app: "api" },
            port: 3000,
            gateway: Gateway.Tenant,
          },
        ],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate network policies for multiple exposed services", async () => {
    const policies = await networkPolicies(mockPkg, "test-ns", "sidecar");

    // Verify we have the expected number of policies (default policies + exposed services)
    expect(policies).toHaveLength(7);

    // Define expected service policies
    const servicePolicies = [
      {
        name: "allow-test-pkg-Ingress-8080-frontend Istio tenant gateway",
        ports: [8080, 15008],
      },
      {
        name: "allow-test-pkg-Ingress-8080-backend Istio tenant gateway",
        ports: [8080, 15008],
      },
      {
        name: "allow-test-pkg-Ingress-3000-api Istio tenant gateway",
        ports: [3000, 15008],
      },
    ];

    // Helper function to validate common policy properties
    const validatePolicy = (policy: V1NetworkPolicy, expectedPorts: number[]) => {
      // Verify namespace
      expect(policy.metadata?.namespace).toBe("test-ns");

      // Verify labels
      expect(policy.metadata?.labels).toMatchObject({
        "uds/package": "test-pkg",
        "uds/generation": "1",
      });

      // Verify owner references - only check kind and name as that's what's set in the implementation
      expect(policy.metadata?.ownerReferences).toContainEqual({
        kind: "UDSPackage",
        name: "test-pkg",
      });

      // Verify policy type is Ingress (if policyTypes is defined)
      if (policy.spec?.policyTypes) {
        expect(policy.spec.policyTypes).toContain("Ingress");
      }

      // Verify ingress rules exist and have the correct ports
      expect(policy.spec?.ingress).toBeDefined();
      const ports = policy.spec?.ingress?.[0]?.ports || [];
      expect(ports).toHaveLength(expectedPorts.length);
      expectedPorts.forEach(port => {
        expect(ports).toContainEqual({ port });
      });
    };

    // Verify service policies
    for (const { name, ports } of servicePolicies) {
      const matchingPolicies = policies.filter(p => p.metadata?.name === name);
      expect(matchingPolicies).toHaveLength(1);
      validatePolicy(matchingPolicies[0], ports);
    }

    // Verify default policies are included with package prefix
    const defaultPolicyNames = policies.map(p => p.metadata?.name);
    const expectedDefaultPolicies = [
      "deny-test-pkg-default-deny-all",
      "allow-test-pkg-allow-egress-dns",
      "allow-test-pkg-allow-egress-istiod",
      "allow-test-pkg-allow-ingress-sidecar-monitoring",
    ];

    for (const policyName of expectedDefaultPolicies) {
      expect(defaultPolicyNames).toContain(policyName);
    }

    // Verify default deny all policy
    const defaultDenyPolicy = policies.find(
      p => p.metadata?.name === "deny-test-pkg-default-deny-all",
    );
    expect(defaultDenyPolicy).toBeDefined();
    // For default deny policy, either policyTypes should contain 'Ingress' or be undefined
    if (defaultDenyPolicy?.spec?.policyTypes) {
      expect(defaultDenyPolicy.spec.policyTypes).toContain("Ingress");
    }
    // The ingress array should be empty or undefined
    if (defaultDenyPolicy?.spec?.ingress) {
      expect(defaultDenyPolicy.spec.ingress).toEqual([]);
    }

    // Verify egress DNS policy
    const dnsPolicy = policies.find(p => p.metadata?.name === "allow-test-pkg-allow-egress-dns");
    expect(dnsPolicy).toBeDefined();
    if (dnsPolicy?.spec?.policyTypes) {
      expect(dnsPolicy.spec.policyTypes).toContain("Egress");
    }

    // Verify egress Istio policy
    const istioPolicy = policies.find(
      p => p.metadata?.name === "allow-test-pkg-allow-egress-istiod",
    );
    expect(istioPolicy).toBeDefined();
    if (istioPolicy?.spec?.policyTypes) {
      expect(istioPolicy.spec.policyTypes).toContain("Egress");
    }
  });

  it("should generate authservice policies for SSO clients", async () => {
    const ssoPkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        sso: [
          {
            clientId: "test-client",
            enableAuthserviceSelector: { app: "test-app" },
            name: "",
          },
        ],
      },
    };

    const policies = await networkPolicies(ssoPkg, "test-ns", "sidecar");

    // Should have authservice and keycloak policies
    const authservicePolicy = policies.find(p => p.metadata?.name?.includes("authservice egress"));
    const keycloakPolicy = policies.find(p => p.metadata?.name?.includes("keycloak JWKS egress"));

    expect(authservicePolicy).toBeDefined();
    expect(keycloakPolicy).toBeDefined();
    expect(authservicePolicy?.spec?.egress?.[0]?.to?.[0]?.podSelector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "authservice",
    });
  });

  it("should skip directResponse services in expose", async () => {
    const directResponsePkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        network: {
          ...mockPkg.spec?.network,
          expose: [
            {
              service: "direct-svc",
              host: "direct.example.com",
              selector: { app: "direct" },
              port: 8080,
              advancedHTTP: {
                directResponse: {
                  status: 200,
                },
              },
            },
          ],
        },
      },
    };

    const policies = await networkPolicies(directResponsePkg, "test-ns", "sidecar");
    const directResponsePolicy = policies.find(p => p.metadata?.name?.includes("direct"));
    expect(directResponsePolicy).toBeUndefined();
  });

  it("should handle missing network config", async () => {
    const noNetworkPkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        network: undefined,
      },
    };

    const policies = await networkPolicies(noNetworkPkg, "test-ns", "sidecar");
    // Should still generate default policies
    expect(policies.length).toBeGreaterThan(0);
  });

  it("should handle complex selectors", async () => {
    const complexSelectorPkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        network: {
          expose: [
            {
              service: "complex",
              host: "complex.example.com",
              selector: {
                app: "test",
                "app.kubernetes.io/component": "frontend",
                "app.kubernetes.io/instance": "test-instance",
              },
              port: 80,
            },
          ],
        },
      },
    };

    const policies = await networkPolicies(complexSelectorPkg, "test-ns", "sidecar");
    const policy = policies.find(
      p => p.metadata?.name?.includes("80-test"), // Look for port and part of the selector
    );
    expect(policy).toBeDefined();
    expect(policy?.spec?.podSelector?.matchLabels).toEqual({
      app: "test",
      "app.kubernetes.io/component": "frontend",
      "app.kubernetes.io/instance": "test-instance",
    });
  });

  it("should handle missing expose array", async () => {
    const noExposePkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        network: {},
      },
    };

    const policies = await networkPolicies(noExposePkg, "test-ns", "sidecar");
    // Should still generate default policies
    expect(policies.length).toBeGreaterThan(0);
  });

  it("should handle undefined SSO clients", async () => {
    const noSSOPkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        sso: undefined,
      },
    };

    const policies = await networkPolicies(noSSOPkg, "test-ns", "sidecar");
    // Should not fail and still generate default policies
    expect(policies.length).toBeGreaterThan(0);
  });

  it("should handle multiple gateways", async () => {
    const multiGatewayPkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        network: {
          expose: [
            {
              service: "test1",
              host: "test1.example.com",
              selector: { app: "test1" },
              port: 80,
              gateway: Gateway.Tenant,
            },
            {
              service: "test2",
              host: "test2.example.com",
              selector: { app: "test2" },
              port: 80,
              gateway: Gateway.Admin,
            },
          ],
        },
      },
    };

    const policies = await networkPolicies(multiGatewayPkg, "test-ns", "sidecar");

    // Look for policies with the expected port and gateway in the name
    const tenantPolicy = policies.find(
      p =>
        p.metadata?.name?.includes("80-test1") &&
        p.metadata?.name?.toLowerCase().includes("tenant"),
    );
    const adminPolicy = policies.find(
      p =>
        p.metadata?.name?.includes("80-test2") && p.metadata?.name?.toLowerCase().includes("admin"),
    );

    expect(tenantPolicy).toBeDefined();
    expect(adminPolicy).toBeDefined();
  });

  it("should use targetPort when specified", async () => {
    const targetPortPkg: UDSPackage = {
      ...mockPkg,
      spec: {
        ...mockPkg.spec,
        network: {
          expose: [
            {
              service: "test-svc",
              host: "test.example.com",
              selector: { app: "test" },
              port: 80,
              targetPort: 8080,
            },
          ],
        },
      },
    };

    const policies = await networkPolicies(targetPortPkg, "test-ns", "sidecar");
    const policy = policies.find(
      p => p.metadata?.name?.includes("80-test"), // Look for the policy by port and service
    );

    // The port in the policy spec should match targetPort
    const port = policy?.spec?.ingress?.[0]?.ports?.[0]?.port;
    expect(port).toBe(8080);
  });

  it("should apply waypoint selector to ingress policies with matching client", async () => {
    const pkg: UDSPackage = {
      ...mockPkg,
      metadata: {
        ...mockPkg.metadata,
        annotations: {
          "networking.istio.io/waypoint": "test-waypoint",
        },
      },
      spec: {
        ...mockPkg.spec,
        sso: [
          {
            clientId: "test-client",
            enableAuthserviceSelector: { app: "test-app" },
            name: "",
          },
        ],
        network: {
          serviceMesh: {
            mode: Mode.Ambient,
          },
          expose: [
            {
              service: "test-service",
              host: "test.example.com",
              selector: { app: "test-app" },
              port: 8080,
              gateway: Gateway.Tenant,
            },
          ],
        },
      },
    };

    const policies = await networkPolicies(pkg, "test-ns", "ambient");

    // Should find the ingress policy with waypoint selector
    const ingressPolicy = policies.find(
      p => p.metadata?.name?.includes("8080-test-app") && p.spec?.ingress,
    );

    expect(ingressPolicy).toBeDefined();
    // For ingress policies, the waypoint selector should be in the selector
    expect(ingressPolicy?.spec?.podSelector?.matchLabels?.["istio.io/gateway-name"]).toBe(
      "test-client-waypoint",
    );
  });

  it("should use waypoint selector in ambient mode", async () => {
    const waypointPkg: UDSPackage = {
      ...mockPkg,
      metadata: {
        ...mockPkg.metadata,
        annotations: {
          "networking.istio.io/waypoint": "test-waypoint",
        },
      },
      spec: {
        ...mockPkg.spec,
        sso: [
          {
            clientId: "test-client",
            enableAuthserviceSelector: { app: "test-app" },
            name: "",
          },
        ],
      },
    };

    const policies = await networkPolicies(waypointPkg, "test-ns", "ambient");

    // Check for the authservice egress policy
    const authservicePolicy = policies.find(
      p =>
        p.metadata?.name?.includes("test-client") &&
        p.metadata?.name?.toLowerCase().includes("authservice"),
    );

    // Check for the keycloak egress policy
    const keycloakPolicy = policies.find(
      p =>
        p.metadata?.name?.includes("test-client") &&
        p.metadata?.name?.toLowerCase().includes("keycloak"),
    );

    // Check for the ambient health probes policy
    const ambientHealthProbePolicy = policies.find(p =>
      p.metadata?.name?.includes("Ambient Healthprobes"),
    );

    // In ambient mode, we should have the authservice and keycloak policies
    expect(authservicePolicy).toBeDefined();
    expect(keycloakPolicy).toBeDefined();

    // We should also have the ambient health probe policy
    expect(ambientHealthProbePolicy).toBeDefined();
  });
  const basePkg: UDSPackage = {
    ...mockPkg,
    spec: {
      ...mockPkg.spec,
      monitor: [
        {
          description: "Test Metrics",
          selector: { "app.kubernetes.io/name": "test-app" },
          targetPort: 9090,
          portName: "metrics",
        },
      ],
    },
  };

  it("should generate monitor policy with basic configuration", async () => {
    const policies = await networkPolicies(basePkg, "test-ns", "sidecar");
    const monitorPolicy = policies.find(
      p => p.metadata?.name?.includes("9090-test-app") && p.metadata?.name?.includes("Metrics"),
    );

    expect(monitorPolicy).toBeDefined();
    expect(monitorPolicy?.spec?.podSelector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "test-app",
    });
    expect(monitorPolicy?.spec?.ingress?.[0]?.from?.[0]?.namespaceSelector?.matchLabels).toEqual({
      "kubernetes.io/metadata.name": "monitoring",
    });
    expect(monitorPolicy?.spec?.ingress?.[0]?.from?.[0]?.podSelector?.matchLabels).toEqual({
      app: "prometheus",
    });
    expect(monitorPolicy?.spec?.ingress?.[0]?.ports).toContainEqual({ port: 9090 });
  });

  it("should use podSelector when both selector and podSelector are provided", async () => {
    const pkg = {
      ...basePkg,
      spec: {
        ...basePkg.spec,
        monitor: [
          {
            ...(basePkg.spec?.monitor?.[0] ?? {
              description: "Test Metrics",
              selector: { "app.kubernetes.io/name": "test-app" },
              targetPort: 9090,
              portName: "metrics",
            }),
            podSelector: { "app.kubernetes.io/name": "specific-pod" },
          },
        ],
      },
    };

    const policies = await networkPolicies(pkg, "test-ns", "sidecar");
    // Look for the policy using the generated name pattern: "9090-test-app"
    const monitorPolicy = policies.find(
      p =>
        p.metadata?.name?.includes("9090-specific-pod") ||
        p.metadata?.name?.includes("9090-test-app"),
    );

    expect(monitorPolicy).toBeDefined();
    expect(monitorPolicy?.spec?.podSelector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "specific-pod",
    });
  });

  it("should include waypoint selector when ambient mode is enabled and client matches", async () => {
    const pkg = {
      ...basePkg,
      metadata: {
        ...basePkg.metadata,
        annotations: { "networking.istio.io/waypoint": "test-waypoint" },
      },
      spec: {
        ...basePkg.spec,
        sso: [
          {
            clientId: "test-client",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
            name: "",
          },
        ],
        network: {
          serviceMesh: { mode: Mode.Ambient },
        },
      },
    };

    const policies = await networkPolicies(pkg, "test-ns", "ambient");
    const monitorPolicy = policies.find(p => p.metadata?.name?.includes("9090-test-app"));

    expect(monitorPolicy).toBeDefined();
    // Update expectation to match current behavior
    expect(monitorPolicy?.spec?.podSelector?.matchLabels).toEqual({
      "istio.io/gateway-name": "test-client-waypoint",
    });
  });

  it("should handle missing targetPort gracefully", async () => {
    const pkg = {
      ...basePkg,
      spec: {
        ...basePkg.spec,
        monitor: [
          {
            description: "Test Metrics",
            selector: { "app.kubernetes.io/name": "test-app" },
            portName: "metrics",
            targetPort: undefined,
          },
        ],
      },
    } as unknown as UDSPackage;

    const policies = await networkPolicies(pkg, "test-ns", "sidecar");
    // Look for the policy with undefined targetPort in the name
    const monitorPolicy = policies.find(p => p.metadata?.name?.includes("undefined-test-app"));

    // The policy should be created but with an empty ports array
    expect(monitorPolicy).toBeDefined();
    // Check for empty ports array or undefined ports
    const ports = monitorPolicy?.spec?.ingress?.[0]?.ports;
    expect(ports === undefined || (Array.isArray(ports) && ports.length === 0)).toBe(true);
  });

  it("should handle complex selectors correctly", async () => {
    const pkg = {
      ...basePkg,
      spec: {
        ...basePkg.spec,
        monitor: [
          {
            description: "Complex Selector",
            selector: {
              "app.kubernetes.io/name": "test-app",
              "app.kubernetes.io/instance": "test-instance",
              environment: "prod",
            },
            targetPort: 9090,
            portName: "metrics",
          },
        ],
      },
    };

    const policies = await networkPolicies(pkg, "test-ns", "sidecar");
    const monitorPolicy = policies.find(p => p.metadata?.name?.includes("9090-test-app"));

    expect(monitorPolicy).toBeDefined();
    expect(monitorPolicy?.spec?.podSelector?.matchLabels).toEqual({
      "app.kubernetes.io/name": "test-app",
      "app.kubernetes.io/instance": "test-instance",
      environment: "prod",
    });
  });
});
