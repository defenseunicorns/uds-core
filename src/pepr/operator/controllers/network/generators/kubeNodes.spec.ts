/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { V1NetworkPolicyList } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { AuthorizationPolicy } from "../../../crd/generated/istio/authorizationpolicy-v1beta1.js";
import { anywhere } from "./anywhere.js";
import {
  initAllNodesTarget,
  kubeNodes,
  updateKubeNodesAuthorizationPolicies,
  updateKubeNodesFromCreateUpdate,
  updateKubeNodesFromDelete,
} from "./kubeNodes.js";

type KubernetesList<T> = {
  items: T[];
};

type MockNode = {
  metadata: { name: string };
  status: { addresses: { type: string; address: string }[] };
};

vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return {
    ...originalModule,
    K8s: vi.fn(),
    kind: {
      Node: "Node",
      NetworkPolicy: "NetworkPolicy",
    },
  };
});

describe("updateKubeNodesAuthorizationPolicies", () => {
  const mockApply = vi.fn();
  const mockK8sGetNodes = vi.fn<() => Promise<KubernetesList<kind.Node>>>();
  const mockGetNetworkPolicies = vi.fn<() => Promise<KubernetesList<kind.NetworkPolicy>>>();
  const mockGetAuthPolicies = vi.fn<() => Promise<KubernetesList<AuthorizationPolicy>>>();

  (K8s as Mock).mockImplementation(() => ({
    Get: mockK8sGetNodes,
    WithLabel: vi.fn(() => ({
      Get: mockGetAuthPolicies,
    })),
    Apply: mockApply,
  }));

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetAuthPolicies.mockReset();
    mockGetNetworkPolicies.mockResolvedValue({ items: [] });
    mockK8sGetNodes.mockResolvedValue({ items: [] }); // ensures nodeSet starts empty
    process.env.PEPR_WATCH_MODE = "true";
    process.env.PEPR_MODE = "dev";

    await initAllNodesTarget(); // resets nodeSet to []
  });

  it("should update AuthorizationPolicy if ipBlocks differ", async () => {
    const authPol = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: "example-authpol",
        namespace: "default",
        managedFields: [],
      },
      spec: {
        rules: [
          {
            from: [{ source: { ipBlocks: ["0.0.0.0/0"] } }],
          },
        ],
      },
    } as AuthorizationPolicy;

    mockGetAuthPolicies.mockResolvedValue({ items: [authPol] });

    await updateKubeNodesFromCreateUpdate({
      metadata: { name: "node1" },
      status: { addresses: [{ type: "InternalIP", address: "10.0.0.5" }] },
    } as MockNode);

    expect(authPol.spec!.rules![0].from![0].source!.ipBlocks).toEqual(["10.0.0.5/32"]);
    expect(authPol.metadata!.managedFields).toBeUndefined();
    expect(mockApply).toHaveBeenCalled();
  });

  it("should not update AuthorizationPolicy if ipBlocks match", async () => {
    const authPol = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: "authpol-match",
        namespace: "default",
        managedFields: [],
      },
      spec: {
        rules: [
          {
            from: [{ source: { ipBlocks: ["10.0.0.6/32"] } }],
          },
        ],
      },
    } as AuthorizationPolicy;

    mockGetAuthPolicies.mockResolvedValue({ items: [authPol] });

    await updateKubeNodesFromCreateUpdate({
      metadata: { name: "node2" },
      status: { addresses: [{ type: "InternalIP", address: "10.0.0.6" }] },
    } as MockNode);

    expect(mockApply).not.toHaveBeenCalled();
  });

  it("should create 'from' field if missing", async () => {
    const authPol = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: "authpol-nofrom",
        namespace: "default",
        managedFields: [],
      },
      spec: {
        rules: [{}],
      },
    } as AuthorizationPolicy;

    mockGetAuthPolicies.mockResolvedValue({ items: [authPol] });

    await updateKubeNodesFromCreateUpdate({
      metadata: { name: "node3" },
      status: { addresses: [{ type: "InternalIP", address: "10.0.0.7" }] },
    } as MockNode);

    expect(authPol.spec!.rules![0].from?.[0]?.source?.ipBlocks).toEqual(["10.0.0.7/32"]);
    expect(mockApply).toHaveBeenCalled();
  });

  it("should skip policies missing rules", async () => {
    const authPol = {
      apiVersion: "security.istio.io/v1beta1",
      kind: "AuthorizationPolicy",
      metadata: {
        name: "authpol-norules",
        namespace: "default",
      },
      spec: {},
    } as AuthorizationPolicy;

    mockGetAuthPolicies.mockResolvedValue({ items: [authPol] });

    await updateKubeNodesAuthorizationPolicies();

    expect(mockApply).not.toHaveBeenCalled();
  });
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

  const mockNetworkPolicyList: V1NetworkPolicyList = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicyList",
    items: [
      {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: "example-policy",
          namespace: "default",
        },
        spec: {
          podSelector: {}, // required field
          policyTypes: ["Egress"], // or ["Ingress"], or both
          egress: [
            {
              to: [{ ipBlock: { cidr: "0.0.0.0/0" } }], // an IP we don't want
            },
          ],
        },
      },
    ],
  };

  const mockK8sGetNodes = vi.fn<() => Promise<KubernetesList<kind.Node>>>();
  const mockGetNetworkPolicies = vi.fn<() => Promise<KubernetesList<kind.NetworkPolicy>>>();
  const mockApply = vi.fn();

  beforeAll(() => {
    (K8s as Mock).mockImplementation(() => ({
      Get: mockK8sGetNodes,
      WithLabel: vi.fn(() => ({
        Get: mockGetNetworkPolicies,
      })),
      Apply: mockApply,
    }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initAllNodesTarget", () => {
    it("should initialize nodeSet with internal IPs from nodes", async () => {
      mockK8sGetNodes.mockResolvedValue(mockNodeList);
      await initAllNodesTarget();
      const cidrs = kubeNodes();
      // Should have two IPs from mockNodeList
      expect(cidrs).toHaveLength(2);
      expect(cidrs).toEqual(
        expect.arrayContaining([
          { ipBlock: { cidr: "10.0.0.1/32" } },
          { ipBlock: { cidr: "10.0.0.2/32" } },
        ]),
      );
    });
  });

  describe("nodeCIDRs", () => {
    it("should return anywhere if no nodes known", async () => {
      mockK8sGetNodes.mockResolvedValue({ items: [] });
      await initAllNodesTarget();
      const cidrs = kubeNodes();
      // expect it to match "anywhere"
      expect(cidrs).toEqual([anywhere]);
    });
  });

  describe("updateKubeNodesFromCreateUpdate", () => {
    it("should add a node IP if node is ready", async () => {
      mockK8sGetNodes.mockResolvedValueOnce({ items: [] });
      mockGetNetworkPolicies.mockResolvedValue(mockNetworkPolicyList);
      await initAllNodesTarget(); // start empty
      await updateKubeNodesFromCreateUpdate(mockNodeList.items[0]);
      let cidrs = kubeNodes();
      expect(cidrs).toHaveLength(1);
      expect(cidrs[0].ipBlock?.cidr).toBe("10.0.0.1/32");
      expect(mockApply).toHaveBeenCalled();

      await updateKubeNodesFromCreateUpdate(mockNodeList.items[1]);
      cidrs = kubeNodes();
      expect(cidrs).toHaveLength(2);
      expect(cidrs[1].ipBlock?.cidr).toBe("10.0.0.2/32");
      expect(mockApply).toHaveBeenCalled();
    });

    it("should not remove a node that's no longer ready", async () => {
      mockK8sGetNodes.mockResolvedValue(mockNodeList);
      await initAllNodesTarget();
      let cidrs = kubeNodes();
      // Should have two IPs from mockNodeList
      expect(cidrs).toHaveLength(2);
      expect(cidrs).toEqual(
        expect.arrayContaining([
          { ipBlock: { cidr: "10.0.0.1/32" } },
          { ipBlock: { cidr: "10.0.0.2/32" } },
        ]),
      );

      const notReadyNode = {
        metadata: { name: "node1" },
        status: {
          addresses: [{ type: "InternalIP", address: "10.0.0.1" }],
          conditions: [{ type: "Ready", status: "False" }],
        },
      };
      await updateKubeNodesFromCreateUpdate(notReadyNode);
      cidrs = kubeNodes();
      expect(cidrs).toHaveLength(2);
      expect(cidrs).toEqual(
        expect.arrayContaining([
          { ipBlock: { cidr: "10.0.0.1/32" } },
          { ipBlock: { cidr: "10.0.0.2/32" } },
        ]),
      );
    });

    it("should not apply netpol policy changes if a node is already included", async () => {
      // setup 1 node in the set and expect 1 application to a policy
      mockK8sGetNodes.mockResolvedValueOnce({ items: [] });
      mockGetNetworkPolicies.mockResolvedValue(mockNetworkPolicyList);
      await initAllNodesTarget(); // start empty
      // add a node even if it's not ready
      const initialNode = {
        metadata: { name: "node1" },
        status: {
          addresses: [{ type: "InternalIP", address: "10.0.0.9" }],
          conditions: [{ type: "Ready", status: "False" }],
        },
      };
      await updateKubeNodesFromCreateUpdate(initialNode);
      let cidrs = kubeNodes();
      expect(cidrs).toHaveLength(1);
      expect(cidrs[0].ipBlock?.cidr).toBe("10.0.0.9/32");
      expect(mockApply).toHaveBeenCalled();

      // clear out the apply from the setup
      mockApply.mockClear();
      // change initialNode to set the status to ready
      initialNode.status.conditions[0].status = "True";
      await updateKubeNodesFromCreateUpdate(initialNode);
      cidrs = kubeNodes();
      expect(cidrs).toHaveLength(1);
      expect(cidrs[0].ipBlock?.cidr).toBe("10.0.0.9/32");

      // the apply should not have been called
      expect(mockApply).not.toHaveBeenCalled();
    });

    it("should remove the old node IP if the node is updated with a new IP", async () => {
      const oneNodeList = {
        items: [
          {
            metadata: { name: "node1" },
            status: {
              addresses: [{ type: "InternalIP", address: "10.0.0.1" }],
              conditions: [{ type: "Ready", status: "True" }],
            },
          },
        ],
      };

      mockK8sGetNodes.mockResolvedValueOnce(oneNodeList);
      await initAllNodesTarget();
      const cidrsBeforeUpdate = kubeNodes();
      expect(cidrsBeforeUpdate).toHaveLength(1);
      expect(cidrsBeforeUpdate[0].ipBlock?.cidr).toBe("10.0.0.1/32");

      // Update the node with a new IP
      const updatedNode = {
        metadata: { name: "node1" },
        status: {
          addresses: [{ type: "InternalIP", address: "10.0.0.2" }],
          conditions: [{ type: "Ready", status: "True" }],
        },
      };

      await updateKubeNodesFromCreateUpdate(updatedNode);
      const cidrsAfterUpdate = kubeNodes();
      expect(cidrsAfterUpdate).toHaveLength(1);
      expect(cidrsAfterUpdate[0].ipBlock?.cidr).toBe("10.0.0.2/32");
    });
  });

  describe("updateKubeNodesFromDelete", () => {
    it("should remove the node IP from nodeSet", async () => {
      mockK8sGetNodes.mockResolvedValueOnce(mockNodeList);
      await initAllNodesTarget();
      const cidrsBeforeDelete = kubeNodes();
      expect(cidrsBeforeDelete).toHaveLength(2);

      await updateKubeNodesFromDelete(mockNodeList.items[0]);
      const cidrsAfterDelete = kubeNodes();
      expect(cidrsAfterDelete).toHaveLength(1);
      expect(cidrsAfterDelete[0].ipBlock?.cidr).toBe("10.0.0.2/32");
      expect(mockApply).toHaveBeenCalled();
    });
  });
});
