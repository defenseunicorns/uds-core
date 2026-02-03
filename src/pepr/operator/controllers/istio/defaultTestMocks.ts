/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Mock, MockedFunction, vi } from "vitest";
import {
  IstioAuthorizationPolicy,
  IstioGateway,
  IstioServiceEntry,
  IstioSidecar,
  IstioVirtualService,
  K8sGateway,
  RemoteProtocol,
  UDSPackage,
} from "../../crd/index.js";
import { PackageHostMap } from "./types.js";

export const pkgMock: UDSPackage = {
  metadata: {
    name: "test-package",
    namespace: "test-namespace",
    generation: 1,
  },
  spec: {
    network: {
      expose: [],
      allow: [],
    },
  },
};

export const ownerRefsMock: V1OwnerReference[] = [
  {
    apiVersion: "uds.dev/v1alpha1",
    kind: "Package",
    name: "test-package",
    uid: "f50120aa-2713-4502-9496-566b102b1174",
  },
];

export const pkgHostMapMock: PackageHostMap = {
  package1: {
    "example.com": {
      portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
    },
  },
};

// Type for the common mocked methods
export type K8sMockImpl = {
  InNamespace: MockedFunction<() => K8sMockImpl>; // InNamespace doesn't actually type out to a K8sMockImpl, but good enough for testing
  Apply: MockedFunction<() => Promise<unknown>>;
  Get: MockedFunction<() => Promise<unknown>>;
  Delete: MockedFunction<() => Promise<unknown>>;
  Logs: Mock;
  Watch: Mock;
  WithLabel: Mock;
};

// Type for egress mocks
type EgressMocks = {
  applyGwMock: MockedFunction<() => Promise<void>>;
  applyVsMock: MockedFunction<() => Promise<void>>;
  applySeMock: MockedFunction<() => Promise<void>>;
  applySidecarMock: MockedFunction<() => Promise<void>>;
  applyApMock: MockedFunction<() => Promise<void>>;
  applyWaypointMock: MockedFunction<() => Promise<void>>;
  getGwMock: MockedFunction<() => Promise<{ items: IstioGateway[] }>>;
  getVsMock: MockedFunction<() => Promise<{ items: IstioVirtualService[] }>>;
  getNsMock: MockedFunction<() => Promise<kind.Namespace>>;
  getServiceInNsMock: MockedFunction<() => K8sMockImpl>;
  getServiceMock: MockedFunction<() => Promise<kind.Service>>;
  getServiceAccountInNsMock: MockedFunction<() => K8sMockImpl>;
  getServiceAccountMock: MockedFunction<() => Promise<kind.ServiceAccount>>;
  getWaypointMock: MockedFunction<() => Promise<K8sGateway>>;
  deleteGwMock: MockedFunction<() => Promise<void>>;
  deleteVsMock: MockedFunction<() => Promise<void>>;
  deleteSeMock: MockedFunction<() => Promise<void>>;
  deleteSidecarMock: MockedFunction<() => Promise<void>>;
  deleteApMock: MockedFunction<() => Promise<void>>;
  deleteWaypointMock: MockedFunction<() => Promise<void>>;
  getPkgListMock: MockedFunction<() => Promise<{ items: UDSPackage[] }>>;
};

// Default mock implementation for K8s egress operations
export const defaultEgressMocks: EgressMocks = {
  applyGwMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applyVsMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applySeMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applySidecarMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applyApMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applyWaypointMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  getGwMock: vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
    items: [],
  }),
  getVsMock: vi.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
    items: [],
  }),
  getNsMock: vi.fn<() => Promise<kind.Namespace>>().mockResolvedValue({}),
  getServiceInNsMock: vi.fn<() => K8sMockImpl>().mockReturnThis(),
  getServiceMock: vi.fn<() => Promise<kind.Service>>().mockResolvedValue({
    spec: {
      ports: [
        {
          port: 80,
          protocol: "HTTP",
        },
        {
          port: 443,
          protocol: "TLS",
        },
      ],
    },
  }),
  getServiceAccountInNsMock: vi.fn<() => K8sMockImpl>().mockReturnThis(),
  getServiceAccountMock: vi.fn<() => Promise<kind.ServiceAccount>>().mockResolvedValue({}),
  getWaypointMock: vi.fn<() => Promise<K8sGateway>>().mockResolvedValue({}),
  deleteGwMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteVsMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSeMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSidecarMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteApMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteWaypointMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  getPkgListMock: vi.fn<() => Promise<{ items: UDSPackage[] }>>().mockResolvedValue({ items: [] }),
};

export function updateEgressMocks(egressMocks: EgressMocks) {
  const baseImplementation: K8sMockImpl = {
    Apply: vi.fn<() => Promise<void>>().mockResolvedValue(),
    InNamespace: vi.fn<() => K8sMockImpl>().mockReturnThis(),
    Get: vi.fn<() => Promise<void>>().mockResolvedValue(),
    Logs: vi.fn(),
    Delete: vi.fn(),
    Watch: vi.fn(),
    WithLabel: vi.fn<() => K8sMockImpl>().mockReturnThis(),
  };

  const mockK8s = vi.mocked(K8s);

  type K8sModel = { name?: string } | ((...args: unknown[]) => unknown) | string | null | undefined;

  // Create a mapping keyed by model name string
  const k8sImplementations: Record<string, Partial<K8sMockImpl>> = {
    [IstioGateway.name]: {
      ...baseImplementation,
      Get: egressMocks.getGwMock,
      Apply: egressMocks.applyGwMock,
      Delete: egressMocks.deleteGwMock,
    },
    [IstioVirtualService.name]: {
      ...baseImplementation,
      Get: egressMocks.getVsMock,
      Apply: egressMocks.applyVsMock,
      Delete: egressMocks.deleteVsMock,
    },
    [IstioServiceEntry.name]: {
      ...baseImplementation,
      Apply: egressMocks.applySeMock,
      Delete: egressMocks.deleteSeMock,
    },
    [IstioSidecar.name]: {
      ...baseImplementation,
      Apply: egressMocks.applySidecarMock,
      Delete: egressMocks.deleteSidecarMock,
    },
    [IstioAuthorizationPolicy.name]: {
      ...baseImplementation,
      Apply: egressMocks.applyApMock,
      Delete: egressMocks.deleteApMock,
    },
    [K8sGateway.name]: {
      ...baseImplementation,
      Get: egressMocks.getWaypointMock,
      Apply: egressMocks.applyWaypointMock,
      Delete: egressMocks.deleteWaypointMock,
    },
    [UDSPackage.name]: {
      ...baseImplementation,
      Get: egressMocks.getPkgListMock,
    },
    Namespace: {
      ...baseImplementation,
      Get: egressMocks.getNsMock,
    },
    Service: {
      ...baseImplementation,
      InNamespace: egressMocks.getServiceInNsMock,
      Get: egressMocks.getServiceMock,
    },
    ServiceAccount: {
      ...baseImplementation,
      InNamespace: egressMocks.getServiceAccountInNsMock,
      Get: egressMocks.getServiceAccountMock,
    },
  };

  // Define a function to get the appropriate implementation based on model type
  mockK8s.mockImplementation(((model: K8sModel) => {
    // First ensure model exists to prevent 'Cannot read properties of undefined' errors
    if (!model) {
      return baseImplementation;
    }

    // For Istio resources that have a name property
    // Using optional chaining to safely access model.name
    const modelName =
      typeof model === "function" ? model.name : typeof model === "object" ? model.name : undefined;
    if (modelName && k8sImplementations[modelName]) {
      return k8sImplementations[modelName];
    }

    // For core K8s resources, determine by string match
    if (typeof model == "string") {
      return k8sImplementations[model] ?? baseImplementation;
    }

    // If we can't determine the type, return the base implementation
    return baseImplementation;
  }) as unknown as Parameters<typeof mockK8s.mockImplementation>[0]);
}
