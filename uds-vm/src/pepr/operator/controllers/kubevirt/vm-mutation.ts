/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger.js";
import { VirtualMachine as KubevirtVirtualMachine } from "../../crd/kubevirt/virtualmachine-v1.js";

const log = setupLogger(Component.OPERATOR_KUBEVIRT);

const KUBEVIRT_WORKLOAD_LABEL = "uds.dev/kubevirt-workload";

const REQUIRED_ISTIO_ANNOTATIONS: Record<string, string> = {
  "sidecar.istio.io/inject": "true",
  "traffic.sidecar.istio.io/kubevirtInterfaces": "k6t-eth0",
  "istio.io/reroute-virtual-interfaces": "k6t-eth0",
};

/**
 * Inject required Istio annotations into VirtualMachine specs for KubeVirt workload namespaces.
 * Ensures VMs get proper sidecar injection and traffic interception without manual annotation.
 */
export async function mutateVirtualMachine(vm: KubevirtVirtualMachine): Promise<void> {
  const ns = vm.Raw.metadata?.namespace as string | undefined;
  if (!ns) {
    return;
  }

  // Only mutate VMs in kubevirt workload namespaces
  try {
    const namespace = await K8s(kind.Namespace).Get(ns);
    if (namespace.metadata?.labels?.[KUBEVIRT_WORKLOAD_LABEL] !== "true") {
      return;
    }
  } catch {
    return;
  }

  // Ensure template.metadata.annotations exists
  if (!vm.Raw.spec?.template?.metadata) {
    if (!vm.Raw.spec) return;
    if (!vm.Raw.spec.template) vm.Raw.spec.template = {};
    vm.Raw.spec.template.metadata = {};
  }

  const annotations = vm.Raw.spec.template.metadata!.annotations || {};
  let changed = false;

  for (const [key, value] of Object.entries(REQUIRED_ISTIO_ANNOTATIONS)) {
    if (!annotations[key]) {
      annotations[key] = value;
      changed = true;
    }
  }

  if (changed) {
    vm.Raw.spec.template.metadata!.annotations = annotations;
    log.info(`Injected Istio annotations into VirtualMachine ${ns}/${vm.Raw.metadata?.name}`);
  }
}
