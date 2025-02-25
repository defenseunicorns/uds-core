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

const INJECTION_LABEL = "istio-injection";
const AMBIENT_LABEL = "istio.io/dataplane-mode";
const ISTIO_STATE_ANNOTATION = "uds.dev/original-istio-state";

export enum IstioState {
  Sidecar = "sidecar",
  Ambient = "ambient",
  None = "none",
}

/**
 * Determine the proper istio mode (ambient or sidecar) and enable for the package namespace
 *
 * @param pkg
 * @returns string mode
 */
export async function enableIstio(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = { ...(sourceNS.metadata?.labels || {}) };
  const originalInjectionLabel = labels[INJECTION_LABEL];
  const originalAmbientLabel = labels[AMBIENT_LABEL];
  const annotations = { ...(sourceNS.metadata?.annotations || {}) };
  const pkgKey = `uds.dev/pkg-${pkg.metadata.name}`;

  // Mark the original namespace istio setting for if all packages are removed
  if (!annotations[ISTIO_STATE_ANNOTATION]) {
    // If injectionLabel exists, and is "enabled", mark as "sidecar"
    // If ambientLabel exists and is set to "ambient", mark as "ambient"
    // Otherwise, mark as "none"
    annotations[ISTIO_STATE_ANNOTATION] =
      originalInjectionLabel === "enabled"
        ? IstioState.Sidecar
        : originalAmbientLabel === "ambient"
          ? IstioState.Ambient
          : IstioState.None;
  }

  let shouldRestartPods = false;
  let istioState = IstioState.None;

  // Get existing package keys to determine current package modes
  const pkgKeys = Object.keys(annotations).filter(key => key.startsWith("uds.dev/pkg-"));

  // Handle labels based on ambient opt-in or sidecar default
  if (pkg.spec?.network?.serviceMesh?.ambient) {
    annotations[pkgKey] = IstioState.Ambient;
    const sidecarRequired = pkgKeys.some(key => annotations[key] === IstioState.Sidecar);

    // Create warning event if sidecar mode packages exist in the same namespace
    if (sidecarRequired) {
      // Write a warning event to the package, no need to change istio labels
      await writeEvent(pkg, {
        message: `Existing package(s) in the namespace are running in sidecar mode, ambient mode will not be enabled`,
      });
      log.warn(
        `Sidecar mode required for namespace ${pkg.metadata.namespace}, ignoring ambient mode from ${pkg.metadata.name}.`,
      );
      istioState = IstioState.Sidecar;
    } else if (originalAmbientLabel !== IstioState.Ambient) {
      // Ensure ambient mode is enabled and injection is disabled
      labels[AMBIENT_LABEL] = IstioState.Ambient;
      labels[INJECTION_LABEL] = "disabled"; // Explicitly disable in case original was enabled
      log.debug(`Enabling ambient mode for namespace ${pkg.metadata.namespace}.`);
      if (originalInjectionLabel === "enabled") {
        shouldRestartPods = true; // Pods need restarting to remove sidecar
      }
      istioState = IstioState.Ambient;
    }
  } else {
    annotations[pkgKey] = IstioState.Sidecar;
    // Ensure injection is enabled and ambient mode is disabled
    if (originalInjectionLabel !== "enabled") {
      labels[INJECTION_LABEL] = "enabled";
      delete labels[AMBIENT_LABEL]; // Explicitly remove ambient label if it exists
      shouldRestartPods = true; // Pods need restarting due to label change
      log.debug(`Enabling Istio injection for namespace ${pkg.metadata.namespace}.`);

      // Find any packages that are in ambient mode and add warning events
      const ambientPackages = pkgKeys.filter(key => annotations[key] === IstioState.Ambient);
      for (const ambientPkg of ambientPackages) {
        const warnPkg = K8s(UDSPackage)
          .InNamespace(pkg.metadata.namespace)
          .Get(ambientPkg.replace("uds.dev/pkg-", ""));
        await writeEvent(warnPkg, {
          message: `Existing package(s) in the namespace are running in sidecar mode, ambient mode will not be enabled`,
        });
      }
    }
    istioState = IstioState.Sidecar;
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

  // Restart pods if required (to enable or disable sidecar)
  if (shouldRestartPods) {
    log.debug(`Restarting pods in ${pkg.metadata.namespace} due to configuration changes.`);
    if (istioState === IstioState.Sidecar) {
      await killPods(pkg.metadata.namespace, true);
    } else if (istioState === IstioState.Ambient) {
      await killPods(pkg.metadata.namespace, false);
    } else {
      log.warn(
        `Unknown Istio state for namespace ${pkg.metadata.namespace}, skipping pod restart.`,
      );
    }
  }
}

/**
 * Cleanup the namespace by removing Istio labels if there are no remaining packages
 * Or adjust the Istio mode if existing packages change it
 *
 * @param pkg the package to cleanup
 */
export async function cleanupNamespace(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const annotations = sourceNS.metadata?.annotations || {};
  const currentInjectionLabel = labels[INJECTION_LABEL];
  const currentAmbientLabel = labels[AMBIENT_LABEL];
  let desiredIstioState = annotations[ISTIO_STATE_ANNOTATION];
  const currentState =
    currentInjectionLabel === "enabled"
      ? IstioState.Sidecar
      : currentAmbientLabel === "ambient"
        ? IstioState.Ambient
        : IstioState.None;
  let shouldRestartPods = false;

  // Remove the package annotation
  delete annotations[`uds.dev/pkg-${pkg.metadata.name}`];

  // If there are no more UDS Package annotations, restore the original value of the istio-injection label
  if (!Object.keys(annotations).find(key => key.startsWith("uds.dev/pkg-"))) {
    if (desiredIstioState === IstioState.Sidecar) {
      labels[INJECTION_LABEL] = "enabled";
      delete labels[AMBIENT_LABEL];
      // Add sidecar if not present
      if (currentState === IstioState.Ambient) {
        shouldRestartPods = true;
      }
    } else if (desiredIstioState === IstioState.Ambient) {
      labels[AMBIENT_LABEL] = "ambient";
      delete labels[INJECTION_LABEL];
      // Remove sidecar if present
      if (currentState === IstioState.Sidecar) {
        shouldRestartPods = true;
      }
    } else {
      delete labels[INJECTION_LABEL];
      delete labels[AMBIENT_LABEL];
      // Remove sidecar if present
      if (currentState === IstioState.Sidecar) {
        shouldRestartPods = true;
      }
    }
    delete annotations[ISTIO_STATE_ANNOTATION];
  } else {
    // If there are still packages, reevaluate the Istio mode
    const pkgKeys = Object.keys(annotations).filter(key => key.startsWith("uds.dev/pkg-"));
    const sidecarRequired = pkgKeys.some(key => annotations[key] === IstioState.Sidecar);
    // Switch to ambient mode if no sidecar packages exist
    if (!sidecarRequired && currentState === IstioState.Sidecar) {
      labels[AMBIENT_LABEL] = "ambient";
      delete labels[INJECTION_LABEL];
      shouldRestartPods = true;
      desiredIstioState = IstioState.Ambient;
    }
  }

  // Apply the updated Namespace
  log.debug(`Updating namespace ${pkg.metadata.namespace}, removing ${pkg.metadata.name} state.`);
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

  // Kill the pods if we changed the effective Istio state
  if (shouldRestartPods) {
    log.debug(`Attempting pod restart in ${pkg.metadata.namespace} based on istio label change`);
    if (desiredIstioState === IstioState.Sidecar) {
      await killPods(pkg.metadata.namespace, true);
    } else if (desiredIstioState === IstioState.Ambient) {
      await killPods(pkg.metadata.namespace, false);
    } else {
      log.warn(
        `Unknown Istio state for namespace ${pkg.metadata.namespace}, skipping pod restart.`,
      );
    }
  }
}

/**
 * Forces deletion of pods with the incorrect istio sidecar state
 *
 * @param ns The namespace to target
 * @param wantSidecar Whether injection is being enabled
 */
async function killPods(ns: string, wantSidecar: boolean) {
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
    if (wantSidecar && foundSidecar) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, already has sidecar`);
      continue;
    }

    // If disabling injection, ignore pods that don't have the istio sidecar
    if (!wantSidecar && !foundSidecar) {
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
      const action = wantSidecar ? "enable" : "remove";
      log.info(`Deleting pod ${ns}/${pod.metadata?.name} to ${action} the istio sidecar`);
      await K8s(kind.Pod).Delete(pod);
    }
  }
}
