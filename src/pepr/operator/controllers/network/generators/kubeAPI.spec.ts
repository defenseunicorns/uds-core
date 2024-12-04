/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it, jest } from "@jest/globals";
import { kind } from "pepr";
import * as kubeAPI from "./kubeAPI";

jest.mock("./kubeAPI", () => {
  const actual = jest.requireActual("./kubeAPI") as typeof kubeAPI;
  const mockNetPol = jest.fn(); // Create the mock function
  return {
    ...actual,
    updateKubeAPINetworkPolicies: mockNetPol, // Use the mock function directly
  };
});

describe("updateAPIServerCIDR", () => {
  it("handles a static CIDR string", async () => {
    const mockService = {
      spec: {
        clusterIP: "10.0.0.1",
      },
    } as kind.Service;

    const staticCIDR = "192.168.1.0/24";

    await kubeAPI.updateAPIServerCIDR(mockService, staticCIDR);

    expect(kubeAPI.updateKubeAPINetworkPolicies).toHaveBeenCalledWith([
      { ipBlock: { cidr: staticCIDR } },
      { ipBlock: { cidr: "10.0.0.1/32" } },
    ]);
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

    await kubeAPI.updateAPIServerCIDR(mockService, mockSlice);

    expect(kubeAPI.updateKubeAPINetworkPolicies).toHaveBeenCalledWith([
      { ipBlock: { cidr: "192.168.1.2/32" } },
      { ipBlock: { cidr: "192.168.1.3/32" } },
      { ipBlock: { cidr: "10.0.0.1/32" } },
    ]);
  });
});
