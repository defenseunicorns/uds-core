/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { jest } from "@jest/globals";
import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s } from "pepr";
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
  getGwMock: jest.fn().mockImplementation(() => Promise.resolve({ items: [] })),
  getVsMock: jest.fn().mockImplementation(() => Promise.resolve({ items: [] })),
  getNsMock: jest.fn().mockImplementation(() => Promise.resolve({})),
  getServiceInNsMock: jest.fn().mockImplementation(() =>
    Promise.resolve({
      spec: {
        ports: [
          { port: 80, name: "http" },
          { port: 443, name: "https" },
        ],
      },
    }),
  ),
  getServiceMock: jest.fn().mockImplementation(() =>
    Promise.resolve({
      spec: {
        ports: [
          { port: 80, name: "http" },
          { port: 443, name: "https" },
        ],
      },
    }),
  ),
  applyGwMock: jest.fn().mockImplementation(() => Promise.resolve()),
  applyVsMock: jest.fn().mockImplementation(() => Promise.resolve()),
  applySeMock: jest.fn().mockImplementation(() => Promise.resolve()),
  applySidecarMock: jest.fn().mockImplementation(() => Promise.resolve()),
  deleteGwMock: jest.fn().mockImplementation(() => Promise.resolve()),
  deleteVsMock: jest.fn().mockImplementation(() => Promise.resolve()),
  deleteSeMock: jest.fn().mockImplementation(() => Promise.resolve()),
  deleteSidecarMock: jest.fn().mockImplementation(() => Promise.resolve()),
};

export function updateEgressMocks(egressMocks: Record<string, jest.Mock>) {
  const baseImplementation = {
    Apply: jest.fn().mockImplementation(() => Promise.resolve()),
    InNamespace: jest.fn().mockReturnThis(),
    Get: jest.fn().mockImplementation(() => Promise.resolve({})),
    Logs: jest.fn().mockImplementation(() => Promise.resolve()),
    Delete: jest.fn().mockImplementation(() => Promise.resolve()),
    Watch: jest.fn().mockImplementation(() => Promise.resolve()),
    WithLabel: jest.fn().mockReturnThis(),
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
    namespace: { ...baseImplementation, Get: egressMocks.getNsMock },
    service: {
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

      // For core K8s resources, determine by kind first (higher priority)
      // Using optional chaining to safely access model.kind
      if (model?.kind) {
        const kindLower = model.kind.toLowerCase();
        if (kindLower === "namespace" && k8sImplementations["namespace"]) {
          // Add debug logging to verify the namespace mock is being used
          console.log("Using namespace mock", egressMocks.getNsMock);
          return k8sImplementations["namespace"];
        }
        if (kindLower === "service" && k8sImplementations["service"]) {
          return k8sImplementations["service"];
        }
      }

      // For Istio resources that have a name property
      // Using optional chaining to safely access model.name
      if (model?.name && k8sImplementations[model.name]) {
        return k8sImplementations[model.name];
      }

      // If we can't determine the type, return the base implementation
      return baseImplementation;
    }) as any,
  );
}
