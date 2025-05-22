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

export const defaultEgressMocks = {
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
  getServiceInNsMock: jest.fn().mockReturnThis(),
  deleteGwMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteVsMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSeMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
  deleteSidecarMock: jest.fn<() => Promise<void>>().mockResolvedValue(),
};

export function updateEgressMocks(egressMocks: Record<string, jest.Mock>) {
  const baseImplementation = {
    Apply: jest.fn<() => Promise<void>>().mockResolvedValue(),
    InNamespace: jest.fn().mockReturnThis(),
    Get: jest.fn(),
    Logs: jest.fn(),
    Delete: jest.fn(),
    Watch: jest.fn(),
    WithLabel: jest.fn(),
  };

  const mockK8s = jest.mocked(K8s);

  // Define a type for the K8s implementation for better type safety
  type K8sImplementation = {
    Apply: jest.Mock;
    InNamespace: jest.Mock;
    Get: jest.Mock;
    Logs: jest.Mock;
    Delete: jest.Mock;
    Watch: jest.Mock;
    WithLabel: jest.Mock;
  };

  // Define only the implementations for specific resources
  const k8sImplementations: Record<string, K8sImplementation> = {
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
    "namespace": { ...baseImplementation, Get: egressMocks.getNsMock },
    "service": { ...baseImplementation, InNamespace: egressMocks.getServiceInNsMock },
  };

  mockK8s.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((model: any) => k8sImplementations[model.name] || baseImplementation) as any,
  );
}
