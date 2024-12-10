/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { K8s, kind } from "pepr";
import { updateAPIServerCIDR, updateKubeAPINetworkPolicies } from "./kubeAPI";

type KubernetesList<T> = {
  items: T[];
};

jest.mock("pepr", () => {
  const originalModule = jest.requireActual("pepr") as object;
  return {
    ...originalModule,
    K8s: jest.fn(),
  };
});

const mockApply = jest.fn();
const mockGet = jest.fn<() => Promise<KubernetesList<kind.NetworkPolicy>>>();

describe("updateAPIServerCIDR", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (K8s as jest.Mock).mockImplementation(() => ({
      WithLabel: jest.fn(() => ({
        Get: mockGet,
      })),
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
    jest.clearAllMocks();
    (K8s as jest.Mock).mockImplementation(() => ({
      WithLabel: jest.fn(() => ({
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
