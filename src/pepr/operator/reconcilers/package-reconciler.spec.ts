/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, Mock, MockedFunction, test, vi } from "vitest";

// ---- Vitest mocks ----
vi.mock("kubernetes-fluent-client");
vi.mock("../../config");
vi.mock("../controllers/ca-bundles/ca-bundle", () => ({ caBundleConfigMap: vi.fn() }));
vi.mock("../controllers/envoy-gateway/udp-route-resources", () => ({
  envoyGatewayResources: vi.fn(),
  getEnvoyGatewayStatusConditions: vi.fn(result => {
    if (result.defaultDisabled) {
      return [{ type: "Ready", status: "False", reason: "EnvoyGatewayDefaultDisabled" }];
    }
    if (result.portConflict) {
      return [{ type: "Ready", status: "False", reason: "UDPPortConflict" }];
    }
    return undefined;
  }),
  hasDefaultModeUDPExpose: vi.fn(() => false),
  isEnvoyGatewayDefaultEnabled: vi.fn(async () => false),
  reconcileDefaultGatewayListeners: vi.fn(),
}));
vi.mock("../controllers/istio/egress-orchestrator", () => ({ istioEgressResources: vi.fn() }));
vi.mock("../controllers/istio/istio-resources", async () => {
  const originalModule = (await vi.importActual("../controllers/istio/istio-resources")) as object;
  return { ...originalModule, istioResources: vi.fn() };
});
vi.mock("../controllers/istio/namespace", () => ({
  cleanupNamespace: vi.fn(),
  enableIstio: vi.fn(),
}));
vi.mock("../controllers/keycloak/client-sync", () => ({
  keycloak: vi.fn(),
  purgeSSOClients: vi.fn(),
}));
vi.mock("../controllers/keycloak/authservice/authservice", () => ({
  authservice: vi.fn(),
  purgeAuthserviceClients: vi.fn(),
}));
vi.mock("../controllers/monitoring/pod-monitor", () => ({ podMonitor: vi.fn() }));
vi.mock("../controllers/monitoring/service-monitor", () => ({ serviceMonitor: vi.fn() }));
vi.mock("../controllers/network/authorizationPolicies", () => ({
  generateAuthorizationPolicies: vi.fn(),
}));
vi.mock("../controllers/uptime/probe", () => ({ probe: vi.fn() }));
vi.mock("../controllers/uptime/config", () => ({ updateBlackboxConfig: vi.fn() }));
vi.mock("../controllers/utils", () => ({
  retryWithDelay: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  Mutex: vi.fn().mockImplementation(() => ({ acquire: vi.fn().mockResolvedValue(vi.fn()) })),
}));
vi.mock(".", async () => {
  const originalModule = (await vi.importActual(".")) as object;
  return { ...originalModule, writeEvent: vi.fn() };
});
vi.mock("../controllers/istio/egress", async () => {
  const originalModule = (await vi.importActual("../controllers/istio/egress")) as object;
  return {
    ...originalModule,
    reconcileSharedEgressResources: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});
vi.mock("../controllers/istio/virtual-service");
vi.mock("../controllers/network/policies");
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  kind: { CoreEvent: "CoreEvent" },
  Capability: vi.fn().mockImplementation(() => ({
    name: "uds-core-operator",
    description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
  })),
}));

// ---- Imports that depend on mocks ----
import { K8s, Log } from "pepr";
import { uidSeen, writeEvent } from ".";
import { caBundleConfigMap } from "../controllers/ca-bundles/ca-bundle";
import {
  envoyGatewayResources,
  hasDefaultModeUDPExpose,
  isEnvoyGatewayDefaultEnabled,
} from "../controllers/envoy-gateway/udp-route-resources";
import { reconcileSharedEgressResources } from "../controllers/istio/egress";
import { istioEgressResources } from "../controllers/istio/egress-orchestrator";
import { istioResources } from "../controllers/istio/istio-resources";
import { cleanupNamespace, enableIstio } from "../controllers/istio/namespace";
import {
  authservice,
  purgeAuthserviceClients,
} from "../controllers/keycloak/authservice/authservice";
import { purgeSSOClients } from "../controllers/keycloak/client-sync";
import { podMonitor } from "../controllers/monitoring/pod-monitor";
import { serviceMonitor } from "../controllers/monitoring/service-monitor";
import { generateAuthorizationPolicies } from "../controllers/network/authorizationPolicies";
import { networkPolicies } from "../controllers/network/policies";
import { probe } from "../controllers/uptime/probe";
import { retryWithDelay } from "../controllers/utils";
import { Phase, UDSPackage } from "../crd";
import { ExposeProtocol } from "../crd/generated/package-v1alpha1";
import { packageFinalizer, packageReconciler } from "./package-reconciler";

const mockCleanupNamespace: MockedFunction<() => Promise<void>> = vi.fn();
const mockPurgeSSO: MockedFunction<() => Promise<void>> = vi.fn();
const mockPurgeAuthservice: MockedFunction<() => Promise<void>> = vi.fn();
const mockPatchStatus: MockedFunction<() => Promise<void>> = vi.fn();
const mockReconcileSharedEgressResources: MockedFunction<() => Promise<void>> = vi.fn();
const mockWriteEvent = vi.fn();

vi.mock("kubernetes-fluent-client");
vi.mock("../../config");
vi.mock("../controllers/istio/namespace", async () => {
  const originalModule = (await vi.importActual("../controllers/istio/namespace")) as object;
  return { ...originalModule, cleanupNamespace: vi.fn(), enableIstio: vi.fn() };
});
vi.mock("../controllers/keycloak/client-sync", () => ({
  keycloak: vi.fn(),
  purgeSSOClients: vi.fn(),
}));
vi.mock("../controllers/keycloak/authservice/authservice", () => ({
  authservice: vi.fn(),
  purgeAuthserviceClients: vi.fn(),
}));
vi.mock("../controllers/uptime/config", () => ({ updateBlackboxConfig: vi.fn() }));
vi.mock("../controllers/utils", () => ({
  retryWithDelay: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  Mutex: vi.fn().mockImplementation(() => ({ acquire: vi.fn().mockResolvedValue(vi.fn()) })),
}));
vi.mock(".", async () => {
  const originalModule = (await vi.importActual(".")) as object;
  return { ...originalModule, writeEvent: vi.fn() };
});
vi.mock("../controllers/istio/egress", async () => {
  const originalModule = (await vi.importActual("../controllers/istio/egress")) as object;
  return {
    ...originalModule,
    reconcileSharedEgressResources: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});
vi.mock("../controllers/istio/virtual-service");
vi.mock("../controllers/network/policies");
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  kind: { CoreEvent: "CoreEvent" },
  Capability: vi.fn().mockImplementation(() => ({
    name: "uds-core-operator",
    description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
  })),
}));

describe("packageReconciler", () => {
  let mockPackage: UDSPackage;
  beforeEach(() => {
    vi.clearAllMocks();
    uidSeen.clear();
    mockPackage = {
      metadata: {
        name: "test-package",
        namespace: "test-namespace",
        generation: 1,
        uid: "test-uid",
      },
      status: { phase: Phase.Pending, observedGeneration: 0 },
    };
    mockPatchStatus.mockReset().mockResolvedValue(undefined);
    (K8s as Mock).mockImplementation(() => ({ Create: vi.fn(), PatchStatus: mockPatchStatus }));
    (networkPolicies as Mock).mockResolvedValue([]);
    (generateAuthorizationPolicies as Mock).mockResolvedValue([]);
    (enableIstio as Mock).mockResolvedValue(undefined);
    (istioResources as Mock).mockResolvedValue([]);
    (envoyGatewayResources as Mock).mockResolvedValue({
      networkPolicies: [],
      defaultDisabled: false,
      portConflict: false,
    });
    (istioEgressResources as Mock).mockResolvedValue(undefined);
    (podMonitor as Mock).mockResolvedValue([]);
    (serviceMonitor as Mock).mockResolvedValue([]);
    (probe as Mock).mockResolvedValue({ probeNames: [], ssoClients: [] });
    (purgeSSOClients as Mock).mockResolvedValue(undefined);
    (caBundleConfigMap as Mock).mockResolvedValue(undefined);
    (authservice as Mock).mockResolvedValue([]);
  });
  test("logs error for invalid package definitions", async () => {
    delete mockPackage.metadata!.namespace;
    (networkPolicies as Mock).mockRejectedValue(new Error("invalid package"));

    await packageReconciler(mockPackage);

    expect(Log.error).toHaveBeenCalled();
  });

  test("marks package failed when default Envoy Gateway is disabled for UDP expose", async () => {
    (envoyGatewayResources as Mock).mockResolvedValue({
      networkPolicies: [],
      defaultDisabled: true,
      portConflict: false,
    });

    await packageReconciler(mockPackage);

    expect(mockPatchStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({
          phase: Phase.Failed,
          conditions: [expect.objectContaining({ reason: "EnvoyGatewayDefaultDisabled" })],
        }),
      }),
    );
  });

  test("marks package failed when UDP default Gateway port conflicts", async () => {
    (envoyGatewayResources as Mock).mockResolvedValue({
      networkPolicies: [],
      defaultDisabled: false,
      portConflict: true,
    });

    await packageReconciler(mockPackage);

    expect(mockPatchStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({
          phase: Phase.Failed,
          conditions: [expect.objectContaining({ reason: "UDPPortConflict" })],
        }),
      }),
    );
  });
});

describe("packageFinalizer", () => {
  let mockPackage: UDSPackage;
  beforeEach(() => {
    vi.clearAllMocks();

    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace", generation: 1 },
      spec: {
        sso: [
          {
            name: "test-sso",
            clientId: "test-client",
            enableAuthserviceSelector: { enabled: "true" },
          },
        ],
      },
    };

    mockCleanupNamespace.mockReset().mockResolvedValue(undefined);
    mockPurgeSSO.mockReset().mockResolvedValue(undefined);
    mockPurgeAuthservice.mockReset().mockResolvedValue(undefined);
    mockPatchStatus.mockReset().mockResolvedValue(undefined);
    mockReconcileSharedEgressResources.mockReset().mockResolvedValue(undefined);
    mockWriteEvent.mockReset();
    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
      Get: vi.fn(async () => {
        throw { status: 404 };
      }),
      InNamespace: vi.fn().mockReturnThis(),
      PatchStatus: mockPatchStatus,
    }));
    (cleanupNamespace as Mock).mockImplementation(mockCleanupNamespace);
    (purgeSSOClients as Mock).mockImplementation(mockPurgeSSO);
    (purgeAuthserviceClients as Mock).mockImplementation(mockPurgeAuthservice);
    (reconcileSharedEgressResources as Mock).mockImplementation(mockReconcileSharedEgressResources);
    (writeEvent as Mock).mockImplementation(mockWriteEvent);
    (isEnvoyGatewayDefaultEnabled as Mock).mockResolvedValue(false);
  });

  test("should not remove the finalizer for pending packages", async () => {
    mockPackage.status = { phase: Phase.Pending };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should not remove the finalizer for removing packages", async () => {
    mockPackage.status = { phase: Phase.Removing };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should not remove the finalizer for removalfailed packages", async () => {
    mockPackage.status = { phase: Phase.RemovalFailed };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should finalize a ready package", async () => {
    mockPackage.status = { phase: Phase.Ready };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    expect(finalizerRemoved).toEqual(true);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockReconcileSharedEgressResources).toHaveBeenCalled();
  });

  test("should handle failure in cleanupNamespace and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockRejectedValue(new Error("Istio cleanup failed"));
    mockPurgeAuthservice.mockReset();
    mockPurgeSSO.mockReset();
    mockReconcileSharedEgressResources.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("Istio"),
      }),
    );
  });

  test("should handle failure in purgeAuthserviceClients and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset();
    mockPurgeAuthservice.mockRejectedValue(new Error("AuthService cleanup failed"));
    mockPurgeSSO.mockReset();
    mockReconcileSharedEgressResources.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("AuthService"),
      }),
    );
  });

  test("should handle failure in purgeSSOClients and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset();
    mockPurgeAuthservice.mockReset();
    mockPurgeSSO.mockRejectedValue(new Error("SSO cleanup failed"));
    mockReconcileSharedEgressResources.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("SSO"),
      }),
    );
  });

  test("should handle failure in reconcileSharedEgressResources and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset().mockResolvedValue(undefined);
    mockPurgeAuthservice.mockReset().mockResolvedValue(undefined);
    mockPurgeSSO.mockReset().mockResolvedValue(undefined);
    mockReconcileSharedEgressResources
      .mockReset()
      .mockRejectedValue(new Error("Egress cleanup failed"));

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockReconcileSharedEgressResources).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("Egress"),
      }),
    );
  });

  test("should re-reconcile default Envoy Gateway packages during finalization when package has default UDP expose", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockPackage.spec = {
      network: {
        expose: [
          {
            protocol: ExposeProtocol.UDP,
            service: "udp-service",
            selector: { app: "udp" },
            port: 5000,
          },
        ],
      },
    };
    (hasDefaultModeUDPExpose as Mock).mockReturnValue(true);
    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
      Get: vi.fn(async () => ({
        items: [
          {
            metadata: {
              name: "conflicting-package",
              namespace: "conflicting-namespace",
              generation: 1,
              uid: "conflicting-uid",
            },
            spec: {
              network: {
                expose: [
                  {
                    protocol: ExposeProtocol.UDP,
                    service: "udp-service",
                    selector: { app: "udp" },
                    port: 5000,
                  },
                ],
              },
            },
          },
        ],
      })),
      InNamespace: vi.fn().mockReturnThis(),
      PatchStatus: mockPatchStatus,
    }));

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(true);
    expect(envoyGatewayResources).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "conflicting-package" }),
      }),
      "conflicting-namespace",
    );
  });

  test("should handle default Envoy Gateway package re-reconciliation failure and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockPackage.spec = {
      network: {
        expose: [
          {
            protocol: ExposeProtocol.UDP,
            service: "udp-service",
            selector: { app: "udp" },
            port: 5000,
          },
        ],
      },
    };
    (hasDefaultModeUDPExpose as Mock).mockReturnValue(true);
    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
      Get: vi.fn(async () => {
        throw new Error("gateway cleanup failed");
      }),
      InNamespace: vi.fn().mockReturnThis(),
      PatchStatus: mockPatchStatus,
    }));

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("Envoy Gateway UDP resources"),
      }),
    );
  });
});
