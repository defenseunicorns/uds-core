/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { AuthorizationPolicy } from "../../../crd/generated/istio/authorizationpolicy-v1beta1.js";
import {
  updateAPIServerCIDR,
  updateKubeAPIAuthorizationPolicies,
  updateKubeAPINetworkPolicies,
} from "./kubeAPI.js";

type KubernetesList<T> = {
  items: T[];
};

vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return {
    ...originalModule,
    K8s: vi.fn(),
  };
});

const mockApply = vi.fn();
const mockGet = vi.fn<() => Promise<KubernetesList<kind.NetworkPolicy>>>();
const mockCrdGet = vi.fn<() => Promise<KubernetesList<kind.CustomResourceDefinition>>>();

beforeEach(async () => {
  process.env.PEPR_WATCH_MODE = "true";
  process.env.PEPR_MODE = "dev";
  vi.clearAllMocks();
});

describe("updateAPIServerCIDR", () => {
  beforeEach(() => {
    (K8s as Mock).mockImplementation(() => ({
      WithLabel: vi.fn(() => ({
        Get: mockGet,
      })),
      Get: mockCrdGet, // Mock authorization policy CRD get
      Apply: mockApply,
    }));
  });

  it("handles a static CIDR string", async () => {
    const mockService = {
      spec: {
        clusterIP: "10.0.0.1",
      },
    } as kind.Service;

    const staticCIDR = "192.168.1.0/24";

    // Mock the return of `Get` method
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateAPIServerCIDR(mockService, staticCIDR);

    expect(mockGet).toHaveBeenCalledWith();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: [{ ipBlock: { cidr: staticCIDR } }, { ipBlock: { cidr: "10.0.0.1/32" } }],
            },
          ],
        },
      }),
      { force: true }, // Include the second argument in the call
    );
  });

  it("handles an EndpointSlice with multiple endpoints", async () => {
    const mockService = {
      spec: {
        clusterIP: "10.0.0.1",
      },
    } as kind.Service;

    const mockSlice = {
      endpoints: [{ addresses: ["192.168.1.2"] }, { addresses: ["192.168.1.3"] }],
    } as kind.EndpointSlice;

    // Mock the return of `Get` method
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateAPIServerCIDR(mockService, mockSlice);

    expect(mockGet).toHaveBeenCalledWith();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: [
                { ipBlock: { cidr: "192.168.1.2/32" } },
                { ipBlock: { cidr: "192.168.1.3/32" } },
                { ipBlock: { cidr: "10.0.0.1/32" } },
              ],
            },
          ],
        },
      }),
      { force: true }, // Include the second argument in the call
    );
  });

  it("handles an empty EndpointSlice", async () => {
    const mockService = {
      spec: {
        clusterIP: "10.0.0.1",
      },
    } as kind.Service;

    const mockSlice = {
      endpoints: [{}],
    } as kind.EndpointSlice;

    // Mock the return of `Get` method
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateAPIServerCIDR(mockService, mockSlice);

    expect(mockGet).toHaveBeenCalledWith();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: [{ ipBlock: { cidr: "10.0.0.1/32" } }],
            },
          ],
        },
      }),
      { force: true }, // Include the second argument in the call
    );
  });

  it("handles a Service with missing clusterIP", async () => {
    const mockService = {
      spec: {},
    } as kind.Service;

    const mockSlice = {
      endpoints: [{ addresses: ["192.168.1.2"] }],
    } as kind.EndpointSlice;

    // Mock the return of `Get` method
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: [{ ipBlock: { cidr: "0.0.0.0/0" } }],
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateAPIServerCIDR(mockService, mockSlice);

    expect(mockGet).toHaveBeenCalledWith();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: [{ ipBlock: { cidr: "192.168.1.2/32" } }],
            },
          ],
        },
      }),
      { force: true }, // Include the second argument in the call
    );
  });

  it("handles no matching NetworkPolicies", async () => {
    const mockService = {
      spec: {
        clusterIP: "10.0.0.1",
      },
    } as kind.Service;

    const mockSlice = {
      endpoints: [{ addresses: ["192.168.1.2"] }],
    } as kind.EndpointSlice;

    // Mock the return of `Get` method to return no items
    mockGet.mockResolvedValue({
      items: [],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateAPIServerCIDR(mockService, mockSlice);

    expect(mockGet).toHaveBeenCalledWith();
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe("updateKubeAPINetworkPolicies", () => {
  beforeEach(() => {
    (K8s as Mock).mockImplementation(() => ({
      WithLabel: vi.fn(() => ({
        Get: mockGet,
      })),
      Apply: mockApply,
    }));
  });

  it("does not update an egress NetworkPolicy if the peers are already correct", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: newPeers,
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled(); // No update needed
  });

  it("does not update an ingress NetworkPolicy if the peers are already correct", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            ingress: [
              {
                from: newPeers,
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled(); // No update needed
  });

  it("updates an egress NetworkPolicy with different peers", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    const oldPeers = [{ ipBlock: { cidr: "192.168.1.0/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: oldPeers,
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: newPeers,
            },
          ],
        },
      }),
      { force: true },
    );
  });

  it("updates an ingress NetworkPolicy with different peers", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    const oldPeers = [{ ipBlock: { cidr: "192.168.1.0/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            ingress: [
              {
                from: oldPeers,
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          ingress: [
            {
              from: newPeers,
            },
          ],
        },
      }),
      { force: true },
    );
  });

  it("updates an egress NetworkPolicy with no peers", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [
              {
                to: undefined,
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: newPeers,
            },
          ],
        },
      }),
      { force: true },
    );
  });

  it("updates an ingress NetworkPolicy with no peers", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            ingress: [
              {
                from: undefined,
              },
            ],
          },
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          ingress: [
            {
              from: newPeers,
            },
          ],
        },
      }),
      { force: true },
    );
  });

  it("initializes missing egress rules", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            egress: [{}],
          }, // No egress at all
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          egress: [
            {
              to: newPeers,
            },
          ],
        },
      }),
      { force: true },
    );
  });

  it("initializes missing ingress rules", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "mock-netpol",
            namespace: "default",
          },
          spec: {
            ingress: [{}],
          }, // No egress at all
        },
      ],
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          name: "mock-netpol",
          namespace: "default",
        },
        spec: {
          ingress: [
            {
              from: newPeers,
            },
          ],
        },
      }),
      { force: true },
    );
  });

  it("handles no matching NetworkPolicies", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];
    mockGet.mockResolvedValue({
      items: [], // No NetworkPolicies found
    } as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPINetworkPolicies(newPeers);

    expect(mockGet).toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled(); // No policies to update
  });
});

describe("updateKubeAPIAuthorizationPolicies", () => {
  it("should not update a policy if ipBlocks are already correct", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }, { ipBlock: { cidr: "10.0.0.2/32" } }];

    // Simulate a policy that already has the correct ipBlocks.
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "authpol-1", namespace: "default" },
          spec: {
            rules: [{ from: [{ source: { ipBlocks: ["10.0.0.1/32", "10.0.0.2/32"] } }] }],
          },
        },
      ],
    } as unknown as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPIAuthorizationPolicies(newPeers);

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("should update a policy if ipBlocks are outdated", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }, { ipBlock: { cidr: "10.0.0.2/32" } }];

    // Simulate a policy that currently has outdated ipBlocks.
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "authpol-1", namespace: "default", managedFields: {} },
          spec: {
            rules: [{ from: [{ source: { ipBlocks: ["192.168.1.0/32"] } }] }],
          },
        },
      ],
    } as unknown as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPIAuthorizationPolicies(newPeers);

    expect(mockApply).toHaveBeenCalled();
    const updatedPolicy = mockApply.mock.calls[0][0] as AuthorizationPolicy;
    expect(updatedPolicy.spec!.rules![0].from![0].source!.ipBlocks).toEqual([
      "10.0.0.1/32",
      "10.0.0.2/32",
    ]);
  });

  it("should create a 'from' entry if missing", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];

    // Simulate a policy with no 'from' field in its rule.
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "authpol-2", namespace: "default", managedFields: {} },
          spec: {
            rules: [{}],
          },
        },
      ],
    } as unknown as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPIAuthorizationPolicies(newPeers);

    expect(mockApply).toHaveBeenCalled();
    const updatedPolicy = mockApply.mock.calls[0][0] as AuthorizationPolicy;
    expect(updatedPolicy.spec!.rules![0].from![0].source!.ipBlocks).toEqual(["10.0.0.1/32"]);
  });

  it("should log a warning for policies with missing rules and not update", async () => {
    const newPeers = [{ ipBlock: { cidr: "10.0.0.1/32" } }];

    // Simulate a policy that has an empty rules array.
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "authpol-3", namespace: "default" },
          spec: {
            rules: [],
          },
        },
      ],
    } as unknown as KubernetesList<kind.NetworkPolicy>);

    await updateKubeAPIAuthorizationPolicies(newPeers);

    expect(mockApply).not.toHaveBeenCalled();
  });
});
