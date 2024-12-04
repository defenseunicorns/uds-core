/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { kind } from "pepr";
import { updateAPIServerCIDR } from "./kubeAPI";

jest.mock("pepr", () => {
  const originalModule = jest.requireActual("pepr") as object;
  return {
    ...originalModule,
    K8s: jest.fn(),
  };
});

import { K8s } from "pepr";

type KubernetesList<T> = {
  items: T[];
};

describe("updateAPIServerCIDR", () => {
  const mockApply = jest.fn();
  const mockGet = jest.fn<() => Promise<KubernetesList<kind.NetworkPolicy>>>();

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
    );
  });
});
