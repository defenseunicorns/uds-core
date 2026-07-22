/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeEach, describe, expect, Mock, test, vi } from "vitest";
import { mutateVirtualMachine } from "../../../../../src/pepr/operator/controllers/kubevirt/vm-mutation.js";

type TestVirtualMachine = {
  Raw: {
    metadata: {
      name: string;
      namespace?: string;
    };
    spec?: {
      template?: {
        metadata?: {
          annotations?: Record<string, string>;
        };
      };
    };
  };
};

vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return {
    ...originalModule,
    K8s: vi.fn(),
  };
});

const mockNamespaceGet = vi.fn();

describe("mutateVirtualMachine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation((resourceKind: unknown) => {
      if (resourceKind === kind.Namespace) {
        return { Get: mockNamespaceGet };
      }
      return { Get: vi.fn() };
    });
  });

  function makeVM(
    ns: string,
    annotations?: Record<string, string>,
    specPresent = true,
  ): TestVirtualMachine {
    return {
      Raw: {
        metadata: { name: "test-vm", namespace: ns },
        spec: specPresent
          ? {
              template: {
                metadata: {
                  annotations: annotations ? { ...annotations } : undefined,
                },
              },
            }
          : undefined,
      },
    };
  }

  test("skips mutation when namespace has no kubevirt-workload label", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: {} },
    });
    const vm = makeVM("test-ns");
    await mutateVirtualMachine(vm);
    expect(vm.Raw.spec?.template?.metadata?.annotations).toBeUndefined();
  });

  test("injects all required annotations when none exist", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: { "uds.dev/kubevirt-workload": "true" } },
    });
    const vm = makeVM("test-ns");
    await mutateVirtualMachine(vm);

    expect(vm.Raw.spec!.template!.metadata!.annotations).toEqual({
      "sidecar.istio.io/inject": "true",
      "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
      "istio.io/reroute-virtual-interfaces": "k6t-eth0",
    });
  });

  test("preserves existing annotations and adds missing ones", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: { "uds.dev/kubevirt-workload": "true" } },
    });
    const vm = makeVM("test-ns", {
      "sidecar.istio.io/inject": "true",
      "custom-annotation": "value",
    });
    await mutateVirtualMachine(vm);

    const annotations = vm.Raw.spec!.template!.metadata!.annotations!;
    expect(annotations["sidecar.istio.io/inject"]).toBe("true");
    expect(annotations["custom-annotation"]).toBe("value");
    expect(annotations["traffic.sidecar.istio.io/kubevirtInterfaces"]).toBe("k6t-eth0");
    expect(annotations["istio.io/reroute-virtual-interfaces"]).toBe("k6t-eth0");
  });

  test("does not overwrite existing required annotations", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: { "uds.dev/kubevirt-workload": "true" } },
    });
    const vm = makeVM("test-ns", {
      "traffic.sidecar.istio.io/kubevirtInterfaces": "custom-value",
    });
    await mutateVirtualMachine(vm);

    expect(
      vm.Raw.spec!.template!.metadata!.annotations!["traffic.sidecar.istio.io/kubevirtInterfaces"],
    ).toBe("custom-value");
  });

  test("skips when namespace get fails", async () => {
    mockNamespaceGet.mockRejectedValue(new Error("not found"));
    const vm = makeVM("test-ns");
    await mutateVirtualMachine(vm);
    expect(vm.Raw.spec?.template?.metadata?.annotations).toBeUndefined();
  });

  test("skips when namespace is undefined", async () => {
    const vm: TestVirtualMachine = {
      Raw: {
        metadata: { name: "test-vm" },
        spec: { template: { metadata: {} } },
      },
    };
    await mutateVirtualMachine(vm);
  });

  test("creates template.metadata.annotations when missing", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: { "uds.dev/kubevirt-workload": "true" } },
    });
    const vm = makeVM("test-ns", undefined, true);
    // Set annotations to undefined explicitly
    vm.Raw.spec!.template!.metadata!.annotations = undefined;
    await mutateVirtualMachine(vm);

    expect(vm.Raw.spec!.template!.metadata!.annotations).toEqual({
      "sidecar.istio.io/inject": "true",
      "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
      "istio.io/reroute-virtual-interfaces": "k6t-eth0",
    });
  });

  test("does not mutate when all annotations already present", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: { "uds.dev/kubevirt-workload": "true" } },
    });
    const existing = {
      "sidecar.istio.io/inject": "true",
      "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
      "istio.io/reroute-virtual-interfaces": "k6t-eth0",
    };
    const vm = makeVM("test-ns", existing);
    const original = { ...vm.Raw.spec!.template!.metadata!.annotations };
    await mutateVirtualMachine(vm);

    expect(vm.Raw.spec!.template!.metadata!.annotations).toEqual(original);
  });
});
