/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Mock, MockedFunction, vi } from "vitest";
import {
  IstioGateway,
  IstioServiceEntry,
  IstioSidecar,
  IstioVirtualService,
  RemoteProtocol,
  UDSPackage,
} from "../../crd";
import { PackageHostMap } from "./types";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Apply: MockedFunction<() => Promise<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Get: MockedFunction<() => Promise<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Delete: MockedFunction<() => Promise<any>>;
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
  getGwMock: MockedFunction<() => Promise<{ items: IstioGateway[] }>>;
  getVsMock: MockedFunction<() => Promise<{ items: IstioVirtualService[] }>>;
  getNsMock: MockedFunction<() => Promise<kind.Namespace>>;
  getServiceInNsMock: MockedFunction<() => K8sMockImpl>;
  getServiceMock: MockedFunction<() => Promise<kind.Service>>;
  deleteGwMock: MockedFunction<() => Promise<void>>;
  deleteVsMock: MockedFunction<() => Promise<void>>;
  deleteSeMock: MockedFunction<() => Promise<void>>;
  deleteSidecarMock: MockedFunction<() => Promise<void>>;
};

// Default mock implementation for K8s egress operations
export const defaultEgressMocks: EgressMocks = {
  applyGwMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applyVsMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applySeMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  applySidecarMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
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
  deleteGwMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteVsMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSeMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSidecarMock: vi.fn<() => Promise<void>>().mockResolvedValue(),
};

export function updateEgressMocks(egressMocks: EgressMocks) {
  const baseImplementation: K8sMockImpl = {
    Apply: vi.fn<() => Promise<void>>().mockResolvedValue(),
    InNamespace: vi.fn<() => K8sMockImpl>().mockReturnThis(),
    Get: vi.fn<() => Promise<void>>().mockResolvedValue(),
    Logs: vi.fn(),
    Delete: vi.fn(),
    Watch: vi.fn(),
    WithLabel: vi.fn(),
  };

  const mockK8s = vi.mocked(K8s);

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
    Namespace: {
      ...baseImplementation,
      Get: egressMocks.getNsMock,
    },
    Service: {
      ...baseImplementation,
      InNamespace: egressMocks.getServiceInNsMock,
      Get: egressMocks.getServiceMock,
    },
  };

  // Define a function to get the appropriate implementation based on model type
  mockK8s.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((model: any) => {
      // First ensure model exists to prevent 'Cannot read properties of undefined' errors
      if (!model) {
        return baseImplementation;
      }

      // For Istio resources that have a name property
      // Using optional chaining to safely access model.name
      if (model?.name && k8sImplementations[model.name]) {
        return k8sImplementations[model.name];
      }

      // For core K8s resources, determine by string match
      if (typeof model == "string") {
        return k8sImplementations[model] ?? baseImplementation;
      }

      // If we can't determine the type, return the base implementation
      return baseImplementation;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );
}
