/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const failIfReached = () => expect(true).toBe(false);

const KV_WORKLOAD_NS = "policy-tests-kubevirt";

describe("kubevirt istio policy exceptions", () => {
  beforeAll(async () => {
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: KV_WORKLOAD_NS,
        labels: {
          "istio-injection": "disabled",
          "uds.dev/kubevirt-workload": "true",
          "zarf.dev/agent": "ignore",
        },
      },
    });
  });

  afterAll(async () => {
    await K8s(kind.Namespace).Delete(KV_WORKLOAD_NS);
  });

  describe("virt-launcher traffic interception allowances", () => {
    it("should allow kubevirtInterfaces annotation on virt-launcher pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "virt-launcher-test-vm1",
            namespace: KV_WORKLOAD_NS,
            labels: {
              "istio-prometheus-ignore": "yes",
            },
            annotations: {
              "traffic.sidecar.istio.io/kubevirtInterfaces": "eth0",
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
          name: "virt-launcher-test-vm1",
          namespace: KV_WORKLOAD_NS,
        },
      });
    });

    it("should allow reroute-virtual-interfaces annotation on virt-launcher pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "virt-launcher-test-vm2",
            namespace: KV_WORKLOAD_NS,
            labels: {
              "istio-prometheus-ignore": "yes",
            },
            annotations: {
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
          name: "virt-launcher-test-vm2",
          namespace: KV_WORKLOAD_NS,
        },
      });
    });

    it("should deny kubevirtInterfaces annotation on non-virt-launcher pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "regular-pod-kubevirt-annotation",
            namespace: KV_WORKLOAD_NS,
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

    it("should deny kubevirtInterfaces annotation on virt-launcher pod in non-kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "virt-launcher-wrong-ns",
            namespace: "policy-tests",
            annotations: {
              "traffic.sidecar.istio.io/kubevirtInterfaces": "eth0",
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
      ).rejects.toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining(
            "The following istio annotations or labels can modify secure traffic interception are not allowed: annotation traffic.sidecar.istio.io/kubevirtInterfaces",
          ),
        },
      });
    });
  });

  describe("CDI pod sidecar injection allowances", () => {
    it("should allow inject=false on importer pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "importer-test-dv1",
            namespace: KV_WORKLOAD_NS,
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
          name: "importer-test-dv1",
          namespace: KV_WORKLOAD_NS,
        },
      });
    });

    it("should allow inject=false on cdi-upload pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "cdi-upload-test-dv1",
            namespace: KV_WORKLOAD_NS,
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
                name: "upload",
                image: "127.0.0.1/fake",
              },
            ],
          },
        }),
      ).resolves.toMatchObject({
        metadata: {
          name: "cdi-upload-test-dv1",
          namespace: KV_WORKLOAD_NS,
        },
      });
    });

    it("should allow inject=false on cdi-clone pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "cdi-clone-test-dv1",
            namespace: KV_WORKLOAD_NS,
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
                name: "cloner",
                image: "127.0.0.1/fake",
              },
            ],
          },
        }),
      ).resolves.toMatchObject({
        metadata: {
          name: "cdi-clone-test-dv1",
          namespace: KV_WORKLOAD_NS,
        },
      });
    });

    it("should deny inject=false on regular pod in kubevirt namespace", async () => {
      await expect(
        K8s(kind.Pod).Apply({
          metadata: {
            name: "regular-pod-inject-false",
            namespace: KV_WORKLOAD_NS,
            annotations: {
              "sidecar.istio.io/inject": "false",
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
            "The following istio annotations or labels can modify secure traffic interception are not allowed: annotation sidecar.istio.io/inject",
          ),
        },
      });
    });
  });
});
