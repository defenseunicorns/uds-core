/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import yaml from "js-yaml";
import { K8s, kind } from "pepr";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Mock pepr before importing the module under test
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  kind: {
    Pod: "Pod",
    ConfigMap: "ConfigMap",
  },
}));

// Mock the logger
vi.mock("../../../logger", () => ({
  Component: { OPERATOR_ISTIO: "OPERATOR_ISTIO" },
  setupLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock reloadPods — exercised behavior is "called for each GW namespace"
vi.mock("../reload/reload-utils", () => ({
  reloadPods: vi.fn(),
}));

type GatewayTopology = {
  forwardClientCertDetails?: string;
  numTrustedProxies?: number;
  proxyProtocol?: Record<string, unknown>;
};

type MeshConfig = {
  defaultConfig?: {
    gatewayTopology?: GatewayTopology;
  };
};

function buildConfigMap(mesh: MeshConfig): kind.ConfigMap {
  return { data: { mesh: yaml.dump(mesh) } } as kind.ConfigMap;
}

function buildTopology(gatewayTopology: GatewayTopology): kind.ConfigMap {
  return buildConfigMap({ defaultConfig: { gatewayTopology } });
}

function setupK8sPodMock() {
  const getMock = vi.fn().mockResolvedValue({ items: [] });
  (K8s as Mock).mockImplementation((kindType: unknown) =>
    kindType === kind.Pod ? { InNamespace: () => ({ Get: getMock }) } : {},
  );
  return getMock;
}

describe("istio-configmap-sync restartGatewayPods", () => {
  let restartGatewayPods: (cm: kind.ConfigMap) => Promise<void>;
  let reloadPodsMock: Mock;
  let podGetMock: Mock;
  let TENANT_GATEWAY_NAMESPACE: string;
  let ADMIN_GATEWAY_NAMESPACE: string;

  // Seed `lastSeenMeshConfig` with an initial reconcile, then clear the mock
  // so the next call exercises the "change detection" code path cleanly.
  async function seed(cm: kind.ConfigMap) {
    await restartGatewayPods(cm);
    reloadPodsMock.mockClear();
  }

  beforeEach(async () => {
    // Reset module-level `lastSeenMeshConfig` between tests
    vi.resetModules();
    vi.clearAllMocks();
    podGetMock = setupK8sPodMock();

    const mod = await import("./istio-configmap-sync.js");
    restartGatewayPods = mod.restartGatewayPods;
    TENANT_GATEWAY_NAMESPACE = mod.TENANT_GATEWAY_NAMESPACE;
    ADMIN_GATEWAY_NAMESPACE = mod.ADMIN_GATEWAY_NAMESPACE;

    const reloadMod = await import("../reload/reload-utils.js");
    reloadPodsMock = reloadMod.reloadPods as unknown as Mock;
  });

  it("no-ops when configmap has no mesh key", async () => {
    await restartGatewayPods({ data: {} } as kind.ConfigMap);
    expect(reloadPodsMock).not.toHaveBeenCalled();
  });

  it("no-ops when mesh data is empty string", async () => {
    await restartGatewayPods({ data: { mesh: "" } } as kind.ConfigMap);
    expect(reloadPodsMock).not.toHaveBeenCalled();
  });

  it("restarts both gateway namespaces on first observation of config", async () => {
    await restartGatewayPods(buildTopology({ numTrustedProxies: 1 }));

    expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    const namespaces = reloadPodsMock.mock.calls.map(c => c[0]);
    expect(namespaces).toEqual(
      expect.arrayContaining([TENANT_GATEWAY_NAMESPACE, ADMIN_GATEWAY_NAMESPACE]),
    );
  });

  it("fetches pods from both gateway namespaces before calling reloadPods", async () => {
    await restartGatewayPods(buildTopology({ numTrustedProxies: 3 }));
    expect(podGetMock).toHaveBeenCalledTimes(2);
  });

  describe("no restart when", () => {
    it("config is unchanged between reconciles", async () => {
      const cm = buildTopology({
        numTrustedProxies: 2,
        forwardClientCertDetails: "APPEND_FORWARD",
        proxyProtocol: {},
      });
      await seed(cm);

      await restartGatewayPods(cm);
      expect(reloadPodsMock).not.toHaveBeenCalled();
    });

    it("gatewayTopology is absent entirely", async () => {
      // Regression guard: meshConfig without gatewayTopology must not cause
      // spurious restart loops — JSON.stringify(undefined) must match on reruns.
      const cm = buildConfigMap({ defaultConfig: {} });
      await seed(cm);

      await restartGatewayPods(cm);
      expect(reloadPodsMock).not.toHaveBeenCalled();
    });

    it("proxyProtocol stays identically {}", async () => {
      const cm = buildTopology({ proxyProtocol: {} });
      await seed(cm);

      await restartGatewayPods(cm);
      expect(reloadPodsMock).not.toHaveBeenCalled();
    });
  });

  describe("restart when", () => {
    it("numTrustedProxies changes", async () => {
      await seed(buildTopology({ numTrustedProxies: 1 }));

      await restartGatewayPods(buildTopology({ numTrustedProxies: 2 }));
      expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    });

    it("forwardClientCertDetails changes", async () => {
      await seed(buildTopology({ forwardClientCertDetails: "SANITIZE" }));

      await restartGatewayPods(buildTopology({ forwardClientCertDetails: "APPEND_FORWARD" }));
      expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    });

    it("proxyProtocol is toggled on (undefined -> {})", async () => {
      await seed(buildTopology({ numTrustedProxies: 1 }));

      await restartGatewayPods(buildTopology({ numTrustedProxies: 1, proxyProtocol: {} }));
      expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    });

    it("proxyProtocol is toggled off ({} -> undefined)", async () => {
      await seed(buildTopology({ numTrustedProxies: 1, proxyProtocol: {} }));

      await restartGatewayPods(buildTopology({ numTrustedProxies: 1 }));
      expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    });

    it("proxyProtocol nested fields change (forward-compat)", async () => {
      await seed(buildTopology({ proxyProtocol: { someFutureField: "v1" } }));

      await restartGatewayPods(buildTopology({ proxyProtocol: { someFutureField: "v2" } }));
      expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    });

    it("retries next reconcile when reloadPods throws (no premature lastSeen advance)", async () => {
      // Regression guard: if reloadPods throws mid-way, lastSeenMeshConfig must
      // not be advanced, or the same ConfigMap would be skipped on retry and a
      // gateway would silently run stale config.
      const cm = buildTopology({ numTrustedProxies: 1 });
      reloadPodsMock.mockRejectedValueOnce(new Error("API timeout"));

      await expect(restartGatewayPods(cm)).rejects.toThrow("API timeout");
      reloadPodsMock.mockClear();

      await restartGatewayPods(cm);
      expect(reloadPodsMock).toHaveBeenCalledTimes(2);
    });
  });
});
