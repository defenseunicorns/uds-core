/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// End-to-end integration tests for the uds-vm enablement contract.
// Tests the actual path: Package CR with kubevirt.enabled -> uds-vm watcher -> namespace label -> policy behavior.
// Requires the full stack: uds-core + uds-vm Pepr module deployed on the cluster.

import { K8s, kind } from "pepr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Package } from "../src/pepr/operator/crd/package-v1alpha1.js";

const KV_INTEGRATION_NS = "kubevirt-integration-test";
const PACKAGE_NAME = "kubevirt-integration-pkg";

/** Poll until a condition is met, with timeout. */
async function waitFor(
  fn: () => Promise<boolean>,
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

describe("kubevirt enablement contract", () => {
  beforeAll(async () => {
    // Create the namespace without the kubevirt label.
    // The uds-vm watcher should apply it when we create the Package.
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: KV_INTEGRATION_NS,
        labels: {
          "istio-injection": "disabled",
          "zarf.dev/agent": "ignore",
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up the Package CR (triggers watcher finalizer to remove label)
    try {
      await K8s(Package).InNamespace(KV_INTEGRATION_NS).Delete(PACKAGE_NAME);
    } catch {
      // Package may already be gone
    }
    // Wait for label removal
    try {
      await waitFor(async () => {
        const ns = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
        return ns.metadata?.labels?.["uds.dev/kubevirt-workload"] === undefined;
      }, 15_000);
    } catch {
      // Best-effort cleanup
    }
    await K8s(kind.Namespace).Delete(KV_INTEGRATION_NS);
  });

  it("should apply kubevirt-workload label when Package has kubevirt.enabled", async () => {
    // Create a Package CR with kubevirt.enabled: true
    // The uds-vm watcher should see this and label the namespace
    await K8s(Package).Apply({
      metadata: {
        name: PACKAGE_NAME,
        namespace: KV_INTEGRATION_NS,
      },
      spec: {
        kubevirt: {
          enabled: true,
        },
      },
    } as unknown as Package);

    // Wait for the uds-vm watcher to process the Package and label the namespace
    await waitFor(async () => {
      const ns = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
      return ns.metadata?.labels?.["uds.dev/kubevirt-workload"] === "true";
    });

    const namespace = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
    expect(namespace.metadata?.labels?.["uds.dev/kubevirt-workload"]).toBe("true");
  });

  it("should allow virt-launcher pod annotations after enablement", async () => {
    // With the namespace labeled by the watcher, virt-launcher pods should be allowed
    // to use kubevirtInterfaces and reroute-virtual-interfaces annotations
    await expect(
      K8s(kind.Pod).Apply({
        metadata: {
          name: "virt-launcher-integration-vm1",
          namespace: KV_INTEGRATION_NS,
          labels: {
            "istio-prometheus-ignore": "yes",
          },
          annotations: {
            "traffic.sidecar.istio.io/kubevirtInterfaces": "eth0",
            "istio.io/reroute-virtual-interfaces": "eth0",
          },
        },
        spec: {
          containers: [
            {
              name: "compute",
              image: "127.0.0.1/fake",
            },
          ],
        },
      }),
    ).resolves.toMatchObject({
      metadata: {
        name: "virt-launcher-integration-vm1",
        namespace: KV_INTEGRATION_NS,
      },
    });
  });

  it("should allow CDI importer pod with inject=false after enablement", async () => {
    await expect(
      K8s(kind.Pod).Apply({
        metadata: {
          name: "importer-integration-dv1",
          namespace: KV_INTEGRATION_NS,
          labels: {
            "istio-prometheus-ignore": "yes",
          },
          annotations: {
            "sidecar.istio.io/inject": "false",
          },
        },
        spec: {
          containers: [
            {
              name: "importer",
              image: "127.0.0.1/fake",
            },
          ],
        },
      }),
    ).resolves.toMatchObject({
      metadata: {
        name: "importer-integration-dv1",
        namespace: KV_INTEGRATION_NS,
      },
    });
  });

  it("should deny kubevirtInterfaces on regular pod even in enabled namespace", async () => {
    await expect(
      K8s(kind.Pod).Apply({
        metadata: {
          name: "regular-pod-integration",
          namespace: KV_INTEGRATION_NS,
          annotations: {
            "traffic.sidecar.istio.io/kubevirtInterfaces": "eth0",
          },
        },
        spec: {
          containers: [
            {
              name: "test",
              image: "127.0.0.1/fake",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      ok: false,
      data: {
        message: expect.stringContaining(
          "The following istio annotations or labels can modify secure traffic interception are not allowed: annotation traffic.sidecar.istio.io/kubevirtInterfaces",
        ),
      },
    });
  });

  it("should remove kubevirt-workload label when Package is deleted", async () => {
    // Delete the Package CR
    await K8s(Package).InNamespace(KV_INTEGRATION_NS).Delete(PACKAGE_NAME);

    // Wait for the watcher finalizer to remove the label
    await waitFor(async () => {
      const ns = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
      return ns.metadata?.labels?.["uds.dev/kubevirt-workload"] === undefined;
    });

    const namespace = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
    expect(namespace.metadata?.labels?.["uds.dev/kubevirt-workload"]).toBeUndefined();
  });
});
