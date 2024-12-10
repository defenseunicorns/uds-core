/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, beforeAll, describe, expect, it, jest } from "@jest/globals";

import {
  initAllNodesTarget,
  nodeCIDRs,
  // updateKubeNodesFromCreateUpdate,
  // updateKubeNodesFromDelete,
} from "./kubeNodes";
import { K8s, kind } from "pepr";
// import { Component, setupLogger } from "../../../../logger";

type KubernetesList<T> = {
  items: T[];
};

// // Mock logger if needed
// jest.mock("../../../../logger", () => ({
// 	Component: { OPERATOR_GENERATORS: "OPERATOR_GENERATORS" },
// 	setupLogger: () => ({
// 		info: jest.fn(),
// 		warn: jest.fn(),
// 		error: jest.fn(),
// 		debug: jest.fn(),
// 	}),
// }));

jest.mock("pepr", () => {
  const originalModule = jest.requireActual("pepr") as object;
  return {
    ...originalModule,
    K8s: jest.fn(),
    kind: {
      Node: "Node",
      NetworkPolicy: "NetworkPolicy",
    },
  };
});

describe("kubeNodes module", () => {
  const mockNodeList = {
    items: [
      {
        metadata: { name: "node1" },
        status: {
          addresses: [{ type: "InternalIP", address: "10.0.0.1" }],
          conditions: [{ type: "Ready", status: "True" }],
        },
      },
      {
        metadata: { name: "node2" },
        status: {
          addresses: [{ type: "InternalIP", address: "10.0.0.2" }],
          conditions: [{ type: "Ready", status: "True" }],
        },
      },
    ],
  };

  const mockK8sGetNodes = jest.fn<() => Promise<KubernetesList<kind.Node>>>();
  const mockGetNetworkPolicies = jest.fn<() => Promise<KubernetesList<kind.NetworkPolicy>>>();
  const mockApply = jest.fn();

  beforeAll(() => {
    (K8s as jest.Mock).mockImplementation(() => ({
      Get: mockK8sGetNodes,
      WithLabel: jest.fn(() => ({
        Get: mockGetNetworkPolicies,
      })),
      Apply: mockApply,
    }));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (K8s as jest.Mock).mockImplementation(() => ({
      Get: mockK8sGetNodes,
      WithLabel: jest.fn(() => ({
        Get: mockGetNetworkPolicies,
      })),
      Apply: mockApply,
    }));
  });

  describe("initAllNodesTarget", () => {
    it("should initialize nodeSet with internal IPs from nodes", async () => {
      mockK8sGetNodes.mockResolvedValue(mockNodeList);
      await initAllNodesTarget();
      const cidrs = nodeCIDRs();
      // Should have two IPs from mockNodeList
      expect(cidrs).toHaveLength(2);
      expect(cidrs).toEqual(
        expect.arrayContaining([
          { ipBlock: { cidr: "10.0.0.1/32" } },
          { ipBlock: { cidr: "10.0.0.2/32" } },
        ]),
      );
    });

    // it("should handle errors and default to anywhere if no nodes", async () => {
    // 	mockK8sGetNodes.mockRejectedValueOnce(new Error("Network Error"));
    // 	await initAllNodesTarget();
    // 	const cidrs = nodeCIDRs();
    // 	// Expect fallback to anywhere
    // 	expect(cidrs).toEqual([{ ipBlock: { cidr: "0.0.0.0/0" } }]);
    // });
  });

  describe("nodeCIDRs", () => {
    it("should return CIDRs for currently known nodes", async () => {
      mockK8sGetNodes.mockResolvedValue(mockNodeList);
      await initAllNodesTarget();
      const cidrs = nodeCIDRs();
      expect(cidrs).toHaveLength(2);
      expect(cidrs[0].ipBlock?.cidr).toBe("10.0.0.1/32");
      expect(cidrs[1].ipBlock?.cidr).toBe("10.0.0.2/32");
    });

    it("should return anywhere if no nodes known", async () => {
      mockK8sGetNodes.mockResolvedValue({ items: [] });
      await initAllNodesTarget();
      const cidrs = nodeCIDRs();
      expect(cidrs).toEqual([{ ipBlock: { cidr: "0.0.0.0/0" } }]);
    });
  });

  // describe("updateKubeNodesFromCreateUpdate", () => {
  // it("should add a node IP if node is ready", async () => {
  // 	mockK8sGet.mockResolvedValueOnce({ items: [] });
  // 	await initAllNodesTarget(); // start empty
  // 	await updateKubeNodesFromCreateUpdate(mockNodeList.items[0]);
  // 	const cidrs = nodeCIDRs();
  // 	expect(cidrs).toHaveLength(1);
  // 	expect(cidrs[0].ipBlock?.cidr).toBe("10.0.0.1/32");
  // 	expect(mockK8sApply).toHaveBeenCalled();
  // });

  // it("should not add a node IP if node not ready", async () => {
  // 	const notReadyNode = {
  // 		metadata: { name: "node3" },
  // 		status: {
  // 			addresses: [{ type: "InternalIP", address: "10.0.0.3" }],
  // 			conditions: [{ type: "Ready", status: "False" }],
  // 		},
  // 	};
  // 	mockK8sGet.mockResolvedValueOnce({ items: [] });
  // 	await initAllNodesTarget(); // start empty
  // 	await updateKubeNodesFromCreateUpdate(notReadyNode);
  // 	const cidrs = nodeCIDRs();
  // 	expect(cidrs).toEqual([{ ipBlock: { cidr: "0.0.0.0/0" } }]); // no change
  // 	expect(mockK8sApply).toHaveBeenCalled(); // Still called to update polices even if empty
  // });
  // });

  // describe("updateKubeNodesFromDelete", () => {
  // it("should remove the node IP from nodeSet", async () => {
  // 	mockK8sGet.mockResolvedValueOnce(mockNodeList);
  // 	await initAllNodesTarget();
  // 	const cidrsBeforeDelete = nodeCIDRs();
  // 	expect(cidrsBeforeDelete).toHaveLength(2);

  // 	await updateKubeNodesFromDelete(mockNodeList.items[0]);
  // 	const cidrsAfterDelete = nodeCIDRs();
  // 	expect(cidrsAfterDelete).toHaveLength(1);
  // 	expect(cidrsAfterDelete[0].ipBlock?.cidr).toBe("10.0.0.2/32");
  // 	expect(mockK8sApply).toHaveBeenCalled();
  // });
  // });
});
