/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, test } from "@jest/globals";
import { K8s, kind } from "pepr";

jest.setTimeout(30000);

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
        const hasIstioNativeProxy = initContainers.some(container =>
          container.name === "istio-proxy"
        );

        expect(hasIstioNativeProxy).toBe(false);

        // Also check regular containers to be thorough
        const containers = pod.spec?.containers || [];
        const hasIstioProxy = containers.some(container =>
          container.name === "istio-proxy"
        );

        expect(hasIstioProxy).toBe(false);
      }
    });
  });

  // Additional test resource tests can be added in their own describe blocks
});
