/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

const injectionLabel = "istio-injection";
const injectionAnnotation = "uds.dev/original-istio-injection";
const nativeSidecarAnnotation = "uds.dev/native-sidecar-migrated";

/**
 * Syncs the package namespace istio-injection label and adds a label for the package name
 *
 * @param pkg
 */
export async function enableInjection(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const annotations = sourceNS.metadata?.annotations || {};
  const originalInjectionLabel = labels[injectionLabel];
  const pkgKey = `uds.dev/pkg-${pkg.metadata.name}`;

  // Mark the original namespace injection setting for if all packages are removed
  if (!annotations[injectionAnnotation]) {
    annotations[injectionAnnotation] = originalInjectionLabel || "non-existent";
  }

  // If this namespace is already marked as migrated, skip migration
  if (annotations[nativeSidecarAnnotation] === "true") {
    log.debug(`Namespace ${pkg.metadata.namespace} already migrated to native sidecars. Skipping.`);
    return;
  }

  // Ensure the namespace is configured for injection
  if (!annotations[pkgKey] || originalInjectionLabel !== "enabled") {
    labels[injectionLabel] = "enabled";
    annotations[pkgKey] = "true";

    // Apply the updated Namespace
    log.debug(`Updating namespace ${pkg.metadata.namespace} with istio injection label`);
    await K8s(kind.Namespace).Apply(
      {
        metadata: {
          name: pkg.metadata.namespace,
          labels,
          annotations,
        },
      },
      { force: true },
    );

    // Only restart pods if the injection label has changed or migration is incomplete
    if (
      originalInjectionLabel !== labels[injectionLabel] ||
      annotations[nativeSidecarAnnotation] !== "true"
    ) {
      log.debug(
        `Attempting pod restart in ${pkg.metadata.namespace} based on istio injection label or native sidecar migration`,
      );
      await killPods(pkg.metadata.namespace, true);

      // Set the annotation to mark migration as complete
      annotations[nativeSidecarAnnotation] = "true";
      await K8s(kind.Namespace).Apply(
        {
          metadata: {
            name: pkg.metadata.namespace,
            annotations,
          },
        },
        { force: true },
      );
      log.info(`Namespace ${pkg.metadata.namespace} marked as migrated to native sidecars.`);
    }
  }
}

/**
 * Restores the namespace
 *
 * @param pkg the package to cleanup
 */
export async function cleanupNamespace(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const originalInjectionLabel = labels[injectionLabel];
  const annotations = sourceNS.metadata?.annotations || {};

  // Remove the package annotation
  delete annotations[`uds.dev/pkg-${pkg.metadata.name}`];

  // If there are no more UDS Package annotations, restore the original value of the istio-injection label
  if (!Object.keys(annotations).find(key => key.startsWith("uds.dev/pkg-"))) {
    labels[injectionLabel] = annotations[injectionAnnotation];
    // If the original value was non-existent, remove the label
    if (labels[injectionLabel] === "non-existent") {
      delete labels[injectionLabel];
    }
    delete annotations[injectionAnnotation];
  }

  // Apply the updated Namespace
  log.debug(`Updating namespace ${pkg.metadata.namespace}, removing istio injection labels.`);
  await K8s(kind.Namespace).Apply(
    {
      metadata: {
        name: pkg.metadata.namespace,
        labels,
        annotations,
      },
    },
    { force: true },
  );

  // Kill the pods if we changed the value of the istio-injection label
  if (originalInjectionLabel !== labels[injectionLabel]) {
    log.debug(
      `Attempting pod restart in ${pkg.metadata.namespace} based on istio injection label change`,
    );
    await killPods(pkg.metadata.namespace, false);
  }
}

/**
 * Forces deletion of pods with the incorrect istio sidecar state
 *
 * @param ns
 * @param enableInjection
 */
async function killPods(ns: string, enableInjection: boolean) {
  // Get all pods in the namespace
  const pods = await K8s(kind.Pod).InNamespace(ns).Get();
  const groups: Record<string, kind.Pod[]> = {};

  for (const pod of pods.items) {
    // Ignore pods that already have a deletion timestamp
    if (pod.metadata?.deletionTimestamp) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, already being deleted`);
      continue;
    }

    // Check for old sidecar (`istio-proxy` container) and native sidecar (`istio-init` init container)
    const hasOldSidecar = pod.spec?.containers?.some(c => c.name === "istio-proxy");
    const hasNativeSidecar = pod.spec?.initContainers?.some(c => c.name === "istio-init");

    // Determine if pod needs to be deleted based on the injection state
    let needsDeletion = false;

    if (enableInjection) {
      // Delete pod if it has `istio-proxy` but not `istio-init`, indicating it's outdated
      if (hasOldSidecar && !hasNativeSidecar) {
        needsDeletion = true;
      } else {
        log.debug(
          `Skipping Pod ${ns}/${pod.metadata?.name}, already has native sidecar or correct config`,
        );
      }
    } else {
      // Delete pod if it still has `istio-proxy` when injection is disabled
      if (hasOldSidecar) {
        needsDeletion = true;
      }
    }

    if (needsDeletion) {
      const controlledBy =
        pod.metadata?.ownerReferences?.find(ref => ref.controller)?.uid || "other";
      groups[controlledBy] = groups[controlledBy] || [];
      log.debug(`Adding Pod ${ns}/${pod.metadata?.name} to ${controlledBy} deletion list.`);
      groups[controlledBy].push(pod);
    }
  }

  // Delete each group of pods
  for (const group of Object.values(groups)) {
    if (group[0].metadata?.ownerReferences?.find(ref => ref.kind === "StatefulSet")) {
      group.sort((a, b) => (b.metadata?.name || "").localeCompare(a.metadata?.name || ""));
    }

    for (const pod of group) {
      const action = enableInjection ? "enable" : "remove";
      log.info(`Deleting pod ${ns}/${pod.metadata?.name} to ${action} the istio sidecar`);
      await K8s(kind.Pod).Delete(pod);
    }
  }
}
