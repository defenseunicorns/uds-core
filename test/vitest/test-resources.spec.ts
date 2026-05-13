/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, test, vi } from "vitest";
import { K8s, kind } from "pepr";

vi.setConfig({ testTimeout: 30000 });

describe("Test Resources Configuration", () => {
  describe("Istio Ambient Mode", () => {
    test("Podinfo namespace should have ambient mode label", async () => {
      // Get the podinfo namespace
      const namespace = await K8s(kind.Namespace).Get("podinfo");

      // Check for the ambient mode label
      expect(namespace.metadata?.labels?.["istio.io/dataplane-mode"]).toBe("ambient");
    });

    test("Podinfo pods should not have istio-proxy sidecar", async () => {
      // Get all podinfo pods
      const pods = await K8s(kind.Pod)
        .InNamespace("podinfo")
        .WithLabel("app.kubernetes.io/name", "podinfo")
        .Get();

      // Ensure we have at least one pod to test
      expect(pods.items.length).toBeGreaterThan(0);

      // Check each pod for absence of istio-proxy in initContainers
      for (const pod of pods.items) {
        const initContainers = pod.spec?.initContainers || [];
        const hasIstioNativeProxy = initContainers.some(
          container => container.name === "istio-proxy",
        );

        expect(hasIstioNativeProxy).toBe(false);

        // Also check regular containers to be thorough
        const containers = pod.spec?.containers || [];
        const hasIstioProxy = containers.some(container => container.name === "istio-proxy");

        expect(hasIstioProxy).toBe(false);
      }
    });
  });

  describe("Deprecated SSO Fields Migration", () => {
    test("test-tenant-app SSO secret should be created with correct configuration", async () => {
      // Get the secret created by the SSO controller
      const secret = await K8s(kind.Secret)
        .InNamespace("test-tenant-app")
        .Get("uds-test-tenant-app-client-secret");

      // Verify the secret exists
      expect(secret).toBeDefined();
      expect(secret.metadata?.name).toBe("uds-test-tenant-app-client-secret");

      // Verify labels from deprecated secretLabels are applied
      expect(secret.metadata?.labels?.app).toBe("uds-test-tenant-app");

      // Verify annotations from deprecated secretAnnotations are applied
      expect(secret.metadata?.annotations?.["uds.dev/test"]).toBe("test");
    });
  });

  // Additional test resource tests can be added in their own describe blocks
});
