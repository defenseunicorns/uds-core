/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const KV_INTEGRATION_NS = "kubevirt-integration-test";

describe("kubevirt namespace label integration", () => {
  beforeAll(async () => {
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
    await K8s(kind.Namespace).Delete(KV_INTEGRATION_NS);
  });

  it("should create namespace with kubevirt-workload label", async () => {
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: KV_INTEGRATION_NS,
        labels: {
          "istio-injection": "disabled",
          "uds.dev/kubevirt-workload": "true",
          "zarf.dev/agent": "ignore",
        },
      },
    });

    const ns = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
    expect(ns.metadata?.labels?.["uds.dev/kubevirt-workload"]).toBe("true");
  });

  it("should allow virt-launcher pod in kubevirt-labeled namespace", async () => {
    return K8s(kind.Pod)
      .Apply({
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
      })
      .then(pod => {
        expect(pod).toMatchObject({
          metadata: {
            name: "virt-launcher-integration-vm1",
            namespace: KV_INTEGRATION_NS,
          },
        });
      });
  });

  it("should allow CDI importer pod with inject=false in kubevirt-labeled namespace", async () => {
    return K8s(kind.Pod)
      .Apply({
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
      })
      .then(pod => {
        expect(pod).toMatchObject({
          metadata: {
            name: "importer-integration-dv1",
            namespace: KV_INTEGRATION_NS,
          },
        });
      });
  });

  it("should deny kubevirtInterfaces on regular pod even in kubevirt namespace", async () => {
    const expected = (e: Error) =>
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio annotations or labels can modify secure traffic interception are not allowed: annotation traffic.sidecar.istio.io/kubevirtInterfaces",
          ),
        },
      });

    return K8s(kind.Pod)
      .Apply({
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
      })
      .then(() => expect(true).toBe(false))
      .catch(expected);
  });

  it("should remove kubevirt-workload label from namespace", async () => {
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: KV_INTEGRATION_NS,
        labels: {
          "istio-injection": "disabled",
          "uds.dev/kubevirt-workload": null,
          "zarf.dev/agent": "ignore",
        },
      },
    });

    const ns = await K8s(kind.Namespace).Get(KV_INTEGRATION_NS);
    expect(ns.metadata?.labels?.["uds.dev/kubevirt-workload"]).toBeUndefined();
  });
});
