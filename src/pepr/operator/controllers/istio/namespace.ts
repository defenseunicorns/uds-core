/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";
import { writeEvent } from "../../reconcilers";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

const injectionLabel = "istio-injection";
const ambientLabel = "istio.io/dataplane-mode";
const istioStateAnnotation = "uds.dev/original-istio-state";

/**
 * Determine the proper istio mode (ambient or sidecar) and enable for the package namespace
 *
 * @param pkg
 */
export async function enableIstio(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = { ...(sourceNS.metadata?.labels || {}) };
  const originalInjectionLabel = labels[injectionLabel];
  const originalAmbientLabel = labels[ambientLabel];
  const annotations = { ...(sourceNS.metadata?.annotations || {}) };
  const pkgKey = `uds.dev/pkg-${pkg.metadata.name}`;

  // Mark the original namespace istio setting for if all packages are removed
  if (!annotations[istioStateAnnotation]) {
    // If injectionLabel exists, and is "enabled", mark as "injected"
    // If ambientLabel exists and is set to "ambient", mark as "ambient"
    // Otherwise, mark as "non-existent"
    annotations[istioStateAnnotation] =
      originalInjectionLabel === "enabled"
        ? "injected"
        : originalAmbientLabel === "ambient"
          ? "ambient"
          : "non-existent";
  }

  let shouldRestartPods = false;

  // Get existing package keys to determine current package modes
  const pkgKeys = Object.keys(annotations).filter(key => key.startsWith("uds.dev/pkg-"));

  // Handle labels based on ambient opt-in or sidecar default
  if (pkg.spec?.network?.serviceMesh?.ambient) {
    annotations[pkgKey] = "ambient";
    const sidecarRequired = pkgKeys.some(key => annotations[key] === "sidecar");

    // Create warning event if sidecar mode packages exist in the same namespace
    if (sidecarRequired) {
      // Write a warning event to the package, no need to change istio labels
      await writeEvent(pkg, {
        message: `Existing package(s) in the namespace are running in sidecar mode, ambient mode will not be enabled`,
      });
      log.warn(
        `Sidecar mode required for namespace ${pkg.metadata.namespace}, ignoring ambient mode from ${pkg.metadata.name}.`,
      );
    } else if (originalAmbientLabel !== "ambient") {
      // Ensure ambient mode is enabled and injection is disabled
      labels[ambientLabel] = "ambient";
      labels[injectionLabel] = "disabled"; // Explicitly disable in case original was enabled
      log.debug(`Enabling ambient mode for namespace ${pkg.metadata.namespace}.`);
    }
  } else {
    annotations[pkgKey] = "sidecar";
    // Ensure injection is enabled and ambient mode is disabled
    if (originalInjectionLabel !== "enabled") {
      labels[injectionLabel] = "enabled";
      delete labels[ambientLabel]; // Explicitly remove ambient label if it exists
      shouldRestartPods = true; // Pods need restarting due to label change
      log.debug(`Enabling Istio injection for namespace ${pkg.metadata.namespace}.`);

      // Find any packages that are in ambient mode and add warning events
      const ambientPackages = pkgKeys.filter(key => annotations[key] === "ambient");
      for (const ambientPkg of ambientPackages) {
        const warnPkg = K8s(UDSPackage)
          .InNamespace(pkg.metadata.namespace)
          .Get(ambientPkg.replace("uds.dev/pkg-", ""));
        await writeEvent(warnPkg, {
          message: `Existing package(s) in the namespace are running in sidecar mode, ambient mode will not be enabled`,
        });
      }
    }
  }

  // Apply namespace updates if there are changes
  const updatedNamespace = {
    metadata: {
      name: pkg.metadata.namespace,
      labels,
      annotations,
    },
  };
  if (
    JSON.stringify(sourceNS.metadata?.labels) !== JSON.stringify(labels) ||
    JSON.stringify(sourceNS.metadata?.annotations) !== JSON.stringify(annotations)
  ) {
    log.debug(`Applying updates to namespace ${pkg.metadata.namespace}.`);
    await K8s(kind.Namespace).Apply(updatedNamespace, { force: true });
  } else {
    log.debug(`No namespace updates needed for ${pkg.metadata.namespace}.`);
  }

  // Restart pods if required
  if (shouldRestartPods) {
    log.debug(`Restarting pods in ${pkg.metadata.namespace} due to configuration changes.`);
    await killPods(pkg.metadata.namespace, true);
  }
}

/**
 * Forces deletion of pods with the incorrect istio sidecar state
 *
 * @param ns The namespace to target
 * @param enableInjection Whether injection is being enabled
 */
async function killPods(ns: string, enableInjection: boolean) {
  // Get all pods in the namespace
  const pods = await K8s(kind.Pod).InNamespace(ns).Get();
  const groups: Record<string, kind.Pod[]> = {};

  // Group the pods by owner UID
  for (const pod of pods.items) {
    // Ignore pods that already have a deletion timestamp
    if (pod.metadata?.deletionTimestamp) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, already being deleted`);
      continue;
    }

    // Checks both container (haven't switched to native sidecars yet) and initContainers for native sidecars
    const foundSidecar =
      pod.spec?.containers?.some(c => c.name === "istio-proxy") ||
      pod.spec?.initContainers?.some(c => c.name === "istio-proxy");

    // If enabling injection, ignore pods that already have the istio sidecar
    if (enableInjection && foundSidecar) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, already has sidecar`);
      continue;
    }

    // If disabling injection, ignore pods that don't have the istio sidecar
    if (!enableInjection && !foundSidecar) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, injection disabled`);
      continue;
    }

    // Get the UID of the owner of the pod or default to "other" (shouldn't happen)
    const controlledBy = pod.metadata?.ownerReferences?.find(ref => ref.controller)?.uid || "other";
    groups[controlledBy] = groups[controlledBy] || [];
    log.debug(`Adding Pod ${ns}/${pod.metadata?.name} to ${controlledBy} deletion list.`);
    groups[controlledBy].push(pod);
  }

  // Delete each group of pods
  for (const group of Object.values(groups)) {
    // If this is a statefulset, delete the pods in reverse name order
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
