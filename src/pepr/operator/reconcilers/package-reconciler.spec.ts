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
  hasDefaultModeUDPExpose: vi.fn(() => false),
  reconcileDefaultGatewayListeners: vi.fn(),
  removeDefaultListenerMapEntry: vi.fn(),
}));
vi.mock("../controllers/istio/egress-orchestrator", () => ({ istioEgressResources: vi.fn() }));
vi.mock("../controllers/keycloak/authservice/host-resources", () => ({
  resolveHostSelectors: vi.fn(),
  applyHostPolicies: vi.fn(),
  purgeHostPolicies: vi.fn(),
  cleanupHostAuthentication: vi.fn(),
}));
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
import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/shared-types";
import { uidSeen, writeEvent } from ".";
import { caBundleConfigMap } from "../controllers/ca-bundles/ca-bundle";
import {
  envoyGatewayResources,
  hasDefaultModeUDPExpose,
  reconcileDefaultGatewayListeners,
  removeDefaultListenerMapEntry,
} from "../controllers/envoy-gateway/udp-route-resources";
import { reconcileSharedEgressResources } from "../controllers/istio/egress";
import { istioEgressResources } from "../controllers/istio/egress-orchestrator";
import { istioResources } from "../controllers/istio/istio-resources";
import { cleanupNamespace, enableIstio } from "../controllers/istio/namespace";
import {
  applyHostPolicies,
  cleanupHostAuthentication,
} from "../controllers/keycloak/authservice/host-resources";
import {
  authservice,
  purgeAuthserviceClients,
} from "../controllers/keycloak/authservice/authservice";
import { keycloak, purgeSSOClients } from "../controllers/keycloak/client-sync";
import { podMonitor } from "../controllers/monitoring/pod-monitor";
import { serviceMonitor } from "../controllers/monitoring/service-monitor";
import { generateAuthorizationPolicies } from "../controllers/network/authorizationPolicies";
import { networkPolicies } from "../controllers/network/policies";
import { probe } from "../controllers/uptime/probe";
import { retryWithDelay } from "../controllers/utils";
import { UDSConfig } from "../controllers/config/config";
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
  purgeSSOSecrets: vi.fn(),
  purgeSSOClients: vi.fn(),
}));
vi.mock("../controllers/keycloak/authservice/authservice", () => ({
  authservice: vi.fn(),
  cleanupAuthservice: vi.fn(),
  purgeAuthserviceClients: vi.fn(),
}));
vi.mock("../controllers/uptime/config", () => ({ updateBlackboxConfig: vi.fn() }));
vi.mock("../controllers/utils", () => ({
  deleteResourceIfUnchanged: vi.fn(),
  retryWithDelay: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  Mutex: class {
    acquire = vi.fn().mockResolvedValue(vi.fn());
  },
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
    (envoyGatewayResources as Mock).mockResolvedValue(undefined);
    (istioEgressResources as Mock).mockResolvedValue(undefined);
    (podMonitor as Mock).mockResolvedValue([]);
    (serviceMonitor as Mock).mockResolvedValue([]);
    (probe as Mock).mockResolvedValue({ probeNames: [], ssoClients: [] });
    (purgeSSOClients as Mock).mockResolvedValue(undefined);
    (caBundleConfigMap as Mock).mockResolvedValue(undefined);
    (authservice as Mock).mockResolvedValue([]);
  });
  test.each(["keycloak", "host policies"])(
    "preserves mesh enforcement when %s setup fails",
    async failure => {
      const identityDeployed = UDSConfig.isIdentityDeployed;
      UDSConfig.isIdentityDeployed = true;
      const failedStep = failure === "keycloak" ? keycloak : applyHostPolicies;
      vi.mocked(failedStep).mockRejectedValueOnce(new Error("setup failed"));
      try {
        await packageReconciler(mockPackage);
        expect(networkPolicies).toHaveBeenCalled();
        expect(generateAuthorizationPolicies).not.toHaveBeenCalled();
        expect(enableIstio).not.toHaveBeenCalled();
        expect(mockPatchStatus).toHaveBeenCalledWith(
          expect.objectContaining({ status: expect.objectContaining({ phase: Phase.Retrying }) }),
        );
      } finally {
        UDSConfig.isIdentityDeployed = identityDeployed;
      }
    },
  );

  test("logs error for invalid package definitions", async () => {
    delete mockPackage.metadata!.namespace;
    (networkPolicies as Mock).mockRejectedValue(new Error("invalid package"));

    await packageReconciler(mockPackage);

    expect(Log.error).toHaveBeenCalled();
  });

  test("uses standard failure handling when Envoy Gateway reconciliation fails", async () => {
    const error = new Error("GatewayClass missing");
    vi.mocked(envoyGatewayResources).mockRejectedValueOnce(error);

    await packageReconciler(mockPackage);

    expect(envoyGatewayResources).toHaveBeenCalledWith(mockPackage, "test-namespace");
    expect(Log.error).toHaveBeenCalledWith({ err: error }, expect.stringContaining("retrying"));
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.objectContaining({ phase: Phase.Retrying }) }),
    );
  });

  test("retains the client inventory for retry when Keycloak deletion fails", async () => {
    mockPackage.status = { ssoClients: ["old-client"], observedGeneration: 0 };
    vi.mocked(purgeSSOClients).mockRejectedValueOnce(new Error("Keycloak unavailable"));
    await packageReconciler(mockPackage);
    expect(purgeSSOClients).toHaveBeenCalledWith(mockPackage, []);
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.objectContaining({ phase: Phase.Retrying }) }),
    );
    for (const [patch] of (mockPatchStatus as Mock).mock.calls) {
      expect(patch.status).not.toHaveProperty("ssoClients");
      expect(patch.status.phase).not.toBe(Phase.Ready);
    }
  });

  test("continues package retry when writing the backoff event fails", async () => {
    vi.useFakeTimers();
    mockPackage.status = { phase: Phase.Retrying, retryAttempt: 1 };
    (writeEvent as Mock).mockRejectedValueOnce(new Error("event creation failed"));

    try {
      const reconciliation = packageReconciler(mockPackage);
      await vi.advanceTimersByTimeAsync(3_000);
      await reconciliation;
    } finally {
      vi.useRealTimers();
    }

    expect(Log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Error writing retry event for test-namespace/test-package; continuing with retry",
    );
    expect(networkPolicies).toHaveBeenCalled();
  });
});

describe("packageFinalizer", () => {
  let mockPackage: UDSPackage;
  beforeEach(() => {
    vi.clearAllMocks();

    mockPackage = {
      metadata: {
        name: "test-package",
        namespace: "test-namespace",
        generation: 1,
        uid: "test-uid",
      },
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
    vi.mocked(cleanupHostAuthentication).mockReset().mockResolvedValue(undefined);
    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
      Get: vi.fn().mockRejectedValue({ status: 404, message: "Not found" }),
      InNamespace: vi.fn().mockReturnThis(),
      WithLabel: vi.fn().mockReturnThis(),
      PatchStatus: mockPatchStatus,
    }));
    (cleanupNamespace as Mock).mockImplementation(mockCleanupNamespace);
    (purgeSSOClients as Mock).mockImplementation(mockPurgeSSO);
    (purgeAuthserviceClients as Mock).mockImplementation(mockPurgeAuthservice);
    (reconcileSharedEgressResources as Mock).mockImplementation(mockReconcileSharedEgressResources);
    (writeEvent as Mock).mockImplementation(mockWriteEvent);
    (hasDefaultModeUDPExpose as Mock).mockReturnValue(false);
    (reconcileDefaultGatewayListeners as Mock).mockResolvedValue(undefined);
    (removeDefaultListenerMapEntry as Mock).mockReturnValue(undefined);
  });

  test.each([Phase.Pending, Phase.Removing, Phase.RemovalFailed])(
    "resumes cleanup after an operator restart in phase %s",
    async phase => {
      mockPackage.status = { phase };
      expect(await packageFinalizer(mockPackage)).toBe(true);
      expect(mockPurgeSSO).toHaveBeenCalled();
    },
  );

  test("retries finalization when host authentication cleanup fails", async () => {
    vi.mocked(cleanupHostAuthentication).mockRejectedValueOnce(
      new Error("Route still terminating"),
    );
    expect(await packageFinalizer(mockPackage)).toBe(false);
    expect(mockCleanupNamespace).not.toHaveBeenCalled();

    expect(await packageFinalizer(mockPackage)).toBe(true);
    expect(cleanupHostAuthentication).toHaveBeenCalledWith(mockPackage);
  });

  test("finishes a deletion replayed on startup and preserves other finalizers", async () => {
    mockPackage.metadata!.deletionTimestamp = new Date();
    mockPackage.metadata!.finalizers = ["other/finalizer", "pepr.dev/finalizer"];
    mockPackage.status = { phase: Phase.Removing };
    const patch = vi.fn();
    const mockK8s = K8s as Mock;
    const normalImplementation = mockK8s.getMockImplementation()!;
    mockK8s.mockImplementation((model, options) => {
      if (model !== UDSPackage) return normalImplementation(model, options);
      if (options?.name) return { Patch: patch };
      return {
        ...normalImplementation(model, options),
        InNamespace: () => ({ Get: vi.fn().mockResolvedValue(mockPackage) }),
      };
    });
    await packageReconciler(mockPackage, WatchPhase.Added);
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/uid", value: "test-uid" },
      { op: "test", path: "/metadata/finalizers/1", value: "pepr.dev/finalizer" },
      { op: "remove", path: "/metadata/finalizers/1" },
    ]);
    expect(networkPolicies).not.toHaveBeenCalled();
  });

  test("retains the finalizer on status errors and excludes overlapping callbacks", async () => {
    mockPatchStatus.mockRejectedValueOnce(new Error("status unavailable"));
    const first = packageFinalizer(mockPackage);
    expect(await packageFinalizer(mockPackage)).toBe(false);
    expect(await first).toBe(false);
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
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

  test("should recompute default Envoy Gateway listeners during finalization when package has default UDP expose", async () => {
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

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(true);
    expect(removeDefaultListenerMapEntry).toHaveBeenCalledWith(mockPackage);
    expect(reconcileDefaultGatewayListeners).toHaveBeenCalledTimes(1);
  });

  test("should not recompute default Gateway listeners for user-managed-only UDP expose", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockPackage.spec = {
      network: {
        expose: [
          {
            protocol: ExposeProtocol.UDP,
            gateway: "team-gateway",
            service: "udp-service",
            selector: { app: "udp" },
            port: 5000,
          },
        ],
      },
    };
    (hasDefaultModeUDPExpose as Mock).mockReturnValue(false);

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(true);
    expect(removeDefaultListenerMapEntry).not.toHaveBeenCalled();
    expect(reconcileDefaultGatewayListeners).not.toHaveBeenCalled();
  });

  test("should handle default Envoy Gateway listener recompute failure and set phase to RemovalFailed", async () => {
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
    (reconcileDefaultGatewayListeners as Mock).mockRejectedValue(
      new Error("gateway cleanup failed"),
    );

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(removeDefaultListenerMapEntry).toHaveBeenCalledWith(mockPackage);
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
