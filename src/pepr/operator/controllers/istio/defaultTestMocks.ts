/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { jest } from "@jest/globals";
import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
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
  InNamespace: jest.MockedFunction<() => K8sMockImpl>; // InNamespace doesn't actually type out to a K8sMockImpl, but good enough for testing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Apply: jest.MockedFunction<() => Promise<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Get: jest.MockedFunction<() => Promise<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Delete: jest.MockedFunction<() => Promise<any>>;
  Logs: jest.Mock;
  Watch: jest.Mock;
  WithLabel: jest.Mock;
};

// Type for egress mocks
type EgressMocks = {
  applyGwMock: jest.MockedFunction<() => Promise<void>>;
  applyVsMock: jest.MockedFunction<() => Promise<void>>;
  applySeMock: jest.MockedFunction<() => Promise<void>>;
  applySidecarMock: jest.MockedFunction<() => Promise<void>>;
  getGwMock: jest.MockedFunction<() => Promise<{ items: IstioGateway[] }>>;
  getVsMock: jest.MockedFunction<() => Promise<{ items: IstioVirtualService[] }>>;
  getNsMock: jest.MockedFunction<() => Promise<kind.Namespace>>;
  getServiceInNsMock: jest.MockedFunction<() => K8sMockImpl>;
  getServiceMock: jest.MockedFunction<() => Promise<kind.Service>>;
  deleteGwMock: jest.MockedFunction<() => Promise<void>>;
  deleteVsMock: jest.MockedFunction<() => Promise<void>>;
  deleteSeMock: jest.MockedFunction<() => Promise<void>>;
  deleteSidecarMock: jest.MockedFunction<() => Promise<void>>;
};

// Default mock implementation for K8s egress operations
export const defaultEgressMocks: EgressMocks = {
  applyGwMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  applyVsMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  applySeMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  applySidecarMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  getGwMock: jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
    items: [],
  }),
  getVsMock: jest.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
    items: [],
  }),
  getNsMock: jest.fn<() => Promise<kind.Namespace>>().mockResolvedValue({}),
  getServiceInNsMock: jest.fn<() => K8sMockImpl>().mockReturnThis(),
  getServiceMock: jest.fn<() => Promise<kind.Service>>().mockResolvedValue({
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
  deleteGwMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteVsMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSeMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSidecarMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
};

export function updateEgressMocks(egressMocks: EgressMocks) {
  const baseImplementation: K8sMockImpl = {
    Apply: jest.fn<() => Promise<void>>().mockResolvedValue(),
    InNamespace: jest.fn<() => K8sMockImpl>().mockReturnThis(),
    Get: jest.fn<() => Promise<void>>().mockResolvedValue(),
    Logs: jest.fn(),
    Delete: jest.fn(),
    Watch: jest.fn(),
    WithLabel: jest.fn(),
  };

  const mockK8s = jest.mocked(K8s);

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
