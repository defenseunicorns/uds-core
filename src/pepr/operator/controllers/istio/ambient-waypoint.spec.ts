/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicySpec } from "@kubernetes/client-node";
import { a } from "pepr";
import { beforeEach, describe, expect, it, test, vi, type MockedFunction } from "vitest";
import { UDSPackage } from "../../crd";
import { Mode, Sso } from "../../crd/generated/package-v1alpha1";
import { PackageStore } from "../packages/package-store";
import {
  createNetworkPolicy,
  generateWaypointNetworkPolicies,
  isWaypointPodHealthy,
  reconcilePod,
  reconcileService,
  registerAmbientPackage,
  setupAmbientWaypoint,
  unregisterAmbientPackage,
} from "./ambient-waypoint";

// Import waypoint utilities
import {
  getPodSelector,
  getWaypointName,
  hasAuthserviceSSO,
  matchesLabels,
  serviceMatchesSelector,
  shouldUseAmbientWaypoint,
} from "../../utils/waypoint";

// Test helpers
const createMockPackage = (
  name: string,
  selector: Record<string, string> = {},
  mode: "ambient" | "sidecar" = "ambient",
  sso: Sso[] = [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: selector,
    },
  ],
): UDSPackage => ({
  metadata: {
    name,
    namespace: "test-ns",
    uid: "test-uid",
  },
  spec: {
    network: {
      serviceMesh: {
        mode: mode === "ambient" ? Mode.Ambient : Mode.Sidecar,
      },
    },
    sso,
  },
});

const createMockService = (
  selector: Record<string, string> = {},
  labels: Record<string, string> = {},
): a.Service => ({
  metadata: {
    name: "test-svc",
    namespace: "test-ns",
    labels: { ...labels },
  },
  spec: { selector: { ...selector } },
});

const createMockPod = (labels: Record<string, string> = {}): a.Pod => ({
  metadata: {
    name: "test-pod",
    namespace: "test-ns",
    labels: { ...labels },
  },
});

// Mock the K8s client methods
const mockApply = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockGet = vi.fn();
const mockInNamespace = vi.fn().mockReturnThis();
const mockWithLabel = vi.fn().mockReturnThis();

// Mock the K8s client
vi.mock("pepr", async () => {
  const actual = await vi.importActual<typeof import("pepr")>("pepr");
  return {
    ...actual,
    K8s: vi.fn().mockImplementation(() => ({
      InNamespace: mockInNamespace,
      WithLabel: mockWithLabel,
      Get: mockGet,
      Apply: mockApply,
      Create: mockCreate,
      Delete: mockDelete,
    })),
  };
});

// Mock the PackageStore
vi.mock("../packages/package-store", () => ({
  PackageStore: {
    getPackageByNamespace: vi.fn().mockReturnValue(undefined),
    addPackage: vi.fn(),
    removePackage: vi.fn(),
  },
}));

// Mock the utils module
vi.mock("../utils", () => ({
  getOwnerRef: vi.fn().mockReturnValue([
    {
      kind: "Package",
      name: "test-pkg",
      uid: "test-uid",
      apiVersion: "uds.dev/v1alpha1",
    },
  ]),
}));

// Create a mock for the log functions
const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

// Mock the istio-resources module
vi.mock("./istio-resources.js", () => ({
  log: mockLog,
}));

describe("hasAuthserviceSSO", () => {
  const testCases = [
    {
      name: "should return true when package has SSO with enableAuthserviceSelector",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      expected: true,
    },
    {
      name: "should return false when package has no SSO configuration",
      pkg: createMockPackage("test", {}, "ambient", []),
      expected: false,
    },
    {
      name: "should return false when package has SSO without enableAuthserviceSelector",
      pkg: createMockPackage("test", {}, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
        },
      ]),
      expected: false,
    },
    {
      name: "should return false when package spec is undefined",
      pkg: { metadata: { name: "test", namespace: "test" } } as UDSPackage,
      expected: false,
    },
    {
      name: "should return false when package is undefined",
      pkg: undefined as unknown as UDSPackage,
      expected: false,
    },
  ];

  it.each(testCases)("$name", ({ pkg, expected }) => {
    expect(hasAuthserviceSSO(pkg)).toBe(expected);
  });
});

describe("shouldUseAmbientWaypoint", () => {
  const testCases = [
    {
      name: "should return true when in ambient mode with SSO",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      expected: true,
    },
    {
      name: "should return false when not in ambient mode",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "sidecar", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      expected: false,
    },
    {
      name: "should return false when no serviceMesh config exists",
      pkg: {
        metadata: { name: "test", namespace: "test" },
        spec: {
          sso: [
            {
              clientId: "test-client",
              name: "test-sso",
              enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
            },
          ],
        },
      } as UDSPackage,
      expected: false,
    },
    {
      name: "should return false when package is undefined",
      pkg: undefined as unknown as UDSPackage,
      expected: false,
    },
  ];

  it.each(testCases)("$name", ({ pkg, expected }) => {
    expect(shouldUseAmbientWaypoint(pkg)).toBe(expected);
  });
});

describe("getWaypointName", () => {
  const validTestCases = [
    { input: "test", expected: "uds-core-test-waypoint" },
    { input: "uds-core-test", expected: "uds-core-test-waypoint" },
  ];

  it.each(validTestCases)("should handle '$input'", ({ input, expected }) => {
    expect(getWaypointName(input)).toBe(expected);
  });

  it("should throw an error when an empty ID is provided", () => {
    expect(() => getWaypointName("")).toThrow("Waypoint ID cannot be empty");
  });

  it("should throw an error when an ID with only whitespace is provided", () => {
    expect(() => getWaypointName("   ")).toThrow("Waypoint ID cannot be empty");
  });
});

describe("getPodSelector", () => {
  const testCases = [
    {
      name: "should return waypoint selector in ambient mode",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      selector: { app: "test" },
      waypointName: "test-waypoint",
      expected: { "istio.io/gateway-name": "test-waypoint" },
    },
    {
      name: "should return original selector in non-ambient mode",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "sidecar", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      selector: { app: "test" },
      waypointName: "test-waypoint",
      expected: { app: "test" },
    },
    {
      name: "should handle undefined package",
      pkg: undefined as unknown as UDSPackage,
      selector: { app: "test" },
      waypointName: "test-waypoint",
      expected: { app: "test" },
    },
  ];

  it.each(testCases)("$name", ({ pkg, selector, waypointName, expected }) => {
    expect(getPodSelector(pkg, selector, waypointName)).toEqual(expected);
  });
});

describe("createNetworkPolicy", () => {
  it("should create a network policy with the correct structure", () => {
    const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
      {
        clientId: "test-client",
        name: "test-sso",
        enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
      },
    ]);
    const spec: V1NetworkPolicySpec = {
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Ingress"],
    };

    const policy = createNetworkPolicy("test-policy", "test-ns", pkg, spec);

    expect(policy).toMatchObject({
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: "test-policy",
        namespace: "test-ns",
        labels: { "uds/managed-by": "uds-operator" },
        ownerReferences: [
          {
            apiVersion: "uds.dev/v1alpha1",
            kind: "Package",
            name: "test-pkg",
            uid: "test-uid", // This should match the mock
          },
        ],
      },
      spec,
    });
  });
});

describe("isWaypointPodHealthy", () => {
  const namespace = "test-ns";
  const waypointName = "test-waypoint";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items: [] });
  });

  const testCases = [
    {
      name: "should return true when a healthy pod exists",
      podStatus: {
        phase: "Running",
        containerStatuses: [
          { name: "container-1", ready: true },
          { name: "container-2", ready: true },
        ],
      },
      expected: true,
    },
    {
      name: "should return false when no pods exist",
      podStatus: { items: [] },
      expected: false,
    },
    {
      name: "should return false when pod is not running",
      podStatus: {
        items: [
          {
            status: {
              phase: "Pending",
              containerStatuses: [{ name: "container-1", ready: true }],
            },
          },
        ],
      },
      expected: false,
    },
  ];

  it.each(testCases)("$name", async ({ podStatus, expected }) => {
    mockGet.mockResolvedValueOnce(
      Array.isArray(podStatus)
        ? { items: podStatus }
        : {
            items: [{ metadata: { name: "test-pod" }, status: podStatus }],
          },
    );

    const result = await isWaypointPodHealthy(namespace, waypointName);
    expect(result).toBe(expected);
    expect(mockInNamespace).toHaveBeenCalledWith(namespace);
    expect(mockWithLabel).toHaveBeenCalledWith(`istio.io/gateway-name=${waypointName}`);
  });
});

describe("matchesLabels", () => {
  const testCases = [
    {
      name: "should match when all key-value pairs match",
      labels: { app: "test", env: "prod" },
      selector: { app: "test", env: "prod" },
      expected: true,
    },
    {
      name: "should not match when values differ",
      labels: { app: "test", env: "prod" },
      selector: { app: "test", env: "dev" },
      expected: false,
    },
    {
      name: "should not match when key is missing",
      labels: { app: "test" },
      selector: { app: "test", missing: "key" },
      expected: false,
    },
    {
      name: "should match empty selector",
      labels: { app: "test" },
      selector: {},
      expected: true,
    },
  ];

  it.each(testCases)("$name", ({ labels, selector, expected }) => {
    expect(
      matchesLabels(labels as Record<string, string>, selector as Record<string, string>),
    ).toBe(expected);
  });
});

describe("reconcileService and reconcilePod", () => {
  const testCases = [
    {
      name: "service",
      reconcileFn: reconcileService,
      createResource: createMockService,
      expectedLabels: {
        "istio.io/use-waypoint": "uds-core-test-pkg-waypoint",
        "istio.io/ingress-use-waypoint": "true",
      },
    },
    {
      name: "pod",
      reconcileFn: reconcilePod,
      createResource: createMockPod,
      expectedLabels: {
        "istio.io/use-waypoint": "uds-core-test-pkg-waypoint",
      },
    },
  ];

  it.each(testCases)(
    "$name - should add waypoint labels when matching package exists",
    async ({ createResource, expectedLabels }) => {
      const resource = createResource({ "app.kubernetes.io/name": "test-app" });
      const pkg = createMockPackage(
        "test-pkg",
        { "app.kubernetes.io/name": "test-app" },
        "ambient",
        [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      );
      (
        PackageStore.getPackageByNamespace as MockedFunction<
          typeof PackageStore.getPackageByNamespace
        >
      ).mockReturnValue(pkg);

      // Cast to the appropriate type based on the resource
      if ("spec" in resource && "selector" in resource.spec!) {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      expect(resource.metadata?.labels).toMatchObject(expectedLabels);
    },
  );

  it.each(testCases)(
    "$name - should not modify when no matching package",
    async ({ createResource, expectedLabels }) => {
      const resource = createResource({ "app.kubernetes.io/name": "test-app" });
      const pkg = createMockPackage(
        "test-pkg",
        { "app.kubernetes.io/name": "no-match" },
        "ambient",
        [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "no-match" },
          },
        ],
      );
      (
        PackageStore.getPackageByNamespace as MockedFunction<
          typeof PackageStore.getPackageByNamespace
        >
      ).mockReturnValue(pkg);

      // Save the original state
      const originalLabels = { ...(resource.metadata?.labels || {}) };

      // Cast to the appropriate type based on the resource
      if ("spec" in resource && "selector" in resource.spec!) {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      // For service, we should have the original labels (empty or with app.kubernetes.io/name)
      // For pod, we should have the original labels
      expect(resource.metadata?.labels).toEqual(originalLabels);

      // Verify no waypoint labels were added
      Object.keys(expectedLabels).forEach(label => {
        expect(resource.metadata?.labels?.[label]).toBeUndefined();
      });
    },
  );
});

describe("serviceMatchesSelector", () => {
  const testCases = [
    {
      name: "should match when selectors match",
      service: createMockService({ app: "test" }),
      selector: { app: "test" },
      expected: true,
    },
    {
      name: "should not match when values differ",
      service: createMockService({ app: "test" }),
      selector: { app: "different" },
      expected: false,
    },
    {
      name: "should not match when key is missing",
      service: createMockService({}),
      selector: { app: "test" },
      expected: false,
    },
  ];

  test.each(testCases)("$name", ({ service, selector, expected }) => {
    expect(serviceMatchesSelector(service, selector)).toBe(expected);
  });
});

describe("registerAmbientPackage", () => {
  const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
    },
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items: [] });
  });

  it("should fetch and reconcile services and pods with matching labels", async () => {
    const services = { items: [createMockService({ "app.kubernetes.io/name": "test-app" })] };
    const pods = { items: [createMockPod({ "app.kubernetes.io/name": "test-app" })] };

    mockGet.mockResolvedValueOnce(services).mockResolvedValueOnce(pods);

    await registerAmbientPackage(pkg);

    expect(mockInNamespace).toHaveBeenCalledWith("test-ns");
    expect(mockWithLabel).toHaveBeenCalledWith("app.kubernetes.io/name=test-app");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("should handle multiple selectors", async () => {
    const pkgWithMultipleSelectors = createMockPackage(
      "test-pkg",
      {
        "app.kubernetes.io/name": "test-app",
        "app.kubernetes.io/component": "api",
      },
      "ambient",
      [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: {
            "app.kubernetes.io/name": "test-app",
            "app.kubernetes.io/component": "api",
          },
        },
      ],
    );

    await registerAmbientPackage(pkgWithMultipleSelectors);

    expect(mockWithLabel).toHaveBeenCalledWith(
      "app.kubernetes.io/name=test-app,app.kubernetes.io/component=api",
    );
  });
});

describe("setupAmbientWaypoint", () => {
  const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
    },
  ]);
  const waypointId = "test-waypoint";

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock the Get method to simulate pod readiness
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "test-pod" },
          status: {
            phase: "Running",
            containerStatuses: [
              { name: "istio-proxy", ready: true },
              { name: "istio-validation", ready: true },
            ],
          },
        },
      ],
    });

    // Mock the createWaypointGateway function directly
    mockCreate.mockResolvedValue({
      metadata: {
        name: "uds-core-test-waypoint",
        namespace: "test-ns",
      },
    });
  });

  it("should create a waypoint gateway and network policies", async () => {
    // Mock the Get method to first return undefined (gateway doesn't exist)
    // and then return a pod for the waitForWaypointPodHealthy function
    mockGet.mockImplementation(name => {
      if (name === "uds-core-test-waypoint") {
        // Simulate gateway not existing to force creation
        throw new Error("Gateway not found");
      }
      // Return mock pod list for the waitForWaypointPodHealthy function
      return Promise.resolve({
        items: [
          {
            metadata: { name: "test-pod" },
            status: {
              phase: "Running",
              containerStatuses: [
                { name: "istio-proxy", ready: true },
                { name: "istio-validation", ready: true },
              ],
            },
          },
        ],
      });
    });

    await setupAmbientWaypoint(pkg, waypointId);

    // Check that Apply was called for network policies
    expect(mockApply).toHaveBeenCalled();

    // We need to verify that the gateway was created
    // Since we're using K8s(K8sGateway).Create() in the implementation,
    // we need to check that K8s was called with K8sGateway and then Create was called
    expect(mockCreate).toHaveBeenCalled();
    expect(mockCreate.mock.calls.length).toBeGreaterThan(0);

    // Verify the gateway object structure
    const gatewayArg = mockCreate.mock.calls[0]?.[0];
    expect(gatewayArg).toBeDefined();
    expect(gatewayArg).toMatchObject({
      metadata: {
        name: "uds-core-test-waypoint",
        namespace: "test-ns",
      },
      spec: {
        gatewayClassName: "istio-waypoint",
      },
    });

    // Find network policy calls
    const networkPolicyCall = mockApply.mock.calls.find(call => call[0]?.kind === "NetworkPolicy");

    expect(networkPolicyCall).toBeDefined();
    expect(networkPolicyCall?.[0]).toMatchObject({
      metadata: {
        name: "uds-core-test-waypoint-ingress-from-app",
        namespace: "test-ns",
      },
      spec: {
        podSelector: {
          matchLabels: {
            "istio.io/gateway-name": "uds-core-test-waypoint",
          },
        },
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              {
                podSelector: {
                  matchLabels: {
                    "app.kubernetes.io/name": "test-app",
                  },
                },
              },
            ],
          },
        ],
      },
    });

    // Verify network policies were created
    const networkPolicyCalls = mockApply.mock.calls.filter(
      call => call[0]?.kind === "NetworkPolicy",
    );
    expect(networkPolicyCalls).toHaveLength(3);
  });
});

describe("generateWaypointNetworkPolicies", () => {
  const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
    },
  ]);
  const waypointName = "test-waypoint";
  const appSelector = { "app.kubernetes.io/name": "test-app" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApply.mockResolvedValue({});
  });

  it("should create ingress and egress network policies", async () => {
    await generateWaypointNetworkPolicies(pkg, waypointName, appSelector);

    const policies = mockApply.mock.calls.map(call => call[0]);
    const ingressPolicy = policies.find(p => p.metadata.name.includes("ingress"));
    const egressPolicy = policies.find(p => p.metadata.name.includes("egress"));

    expect(ingressPolicy).toMatchObject({
      spec: {
        podSelector: { matchLabels: { "istio.io/gateway-name": waypointName } },
        policyTypes: ["Ingress"],
      },
    });

    expect(egressPolicy).toMatchObject({
      spec: {
        podSelector: { matchLabels: { "istio.io/gateway-name": waypointName } },
        policyTypes: ["Egress"],
      },
    });
  });
});

describe("unregisterAmbientPackage", () => {
  it("should log unregistration with correct parameters", async () => {
    const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
      {
        clientId: "test-client",
        name: "test-sso",
        enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
      },
    ]);
    const waypointId = "test-waypoint";

    await unregisterAmbientPackage(pkg, waypointId);

    expect(mockLog.info).toHaveBeenCalledWith("Unregistering ambient waypoint", {
      namespace: "test-ns",
      package: "test-pkg",
      waypointName: "uds-core-test-waypoint",
    });
  });
});
