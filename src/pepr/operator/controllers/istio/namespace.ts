/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind, R } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

const INJECTION_LABEL = "istio-injection";
const AMBIENT_LABEL = "istio.io/dataplane-mode";
const ISTIO_STATE_ANNOTATION = "uds.dev/original-istio-state";

export enum IstioState {
  Sidecar = Mode.Sidecar,
  Ambient = Mode.Ambient,
  None = "none",
}

/**
 * Determine the proper istio mode (ambient or sidecar) and enable for the package namespace
 *
 * @param pkg
 * @returns string mode
 */
export async function enableIstio(pkg: UDSPackage) {
  // This should be impossible in practice but added here so that we can assume these are defined in the rest of the function
  // The types for the GenericKind here allow metadata to be undefined technically
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = { ...(sourceNS.metadata?.labels || {}) };
  const annotations = { ...(sourceNS.metadata?.annotations || {}) };
  const pkgKey = `uds.dev/pkg-${pkg.metadata.name}`;
  const currentIstioState = getCurrentIstioState(labels);

  // Mark the original namespace istio setting for if packages are removed
  if (!annotations[ISTIO_STATE_ANNOTATION]) {
    annotations[ISTIO_STATE_ANNOTATION] = currentIstioState;
  }

  let targetIstioState = IstioState.None;
  annotations[pkgKey] = "true";

  // Handle labels based on sidecar opt-in or ambient default
  if (pkg.spec?.network?.serviceMesh?.mode === Mode.Sidecar) {
    // Sidecar mode requested
    targetIstioState = IstioState.Sidecar;
  } else {
    // Ambient mode requested/by default
    targetIstioState = IstioState.Ambient;
  }

  const result = getIstioLabels(labels, targetIstioState, currentIstioState);

  // Apply namespace updates and restart pods if needed
  await applyNamespaceUpdates(
    pkg.metadata.namespace,
    result.labels,
    annotations,
    sourceNS.metadata?.labels,
    sourceNS.metadata?.annotations,
  );

  await restartPodsIfNeeded(pkg.metadata.namespace, result.shouldRestartPods, targetIstioState);
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
  const labels = { ...(sourceNS.metadata?.labels || {}) };
  const annotations = { ...(sourceNS.metadata?.annotations || {}) };
  const currentState = getCurrentIstioState(labels);
  const originalIstioState = annotations[ISTIO_STATE_ANNOTATION] as IstioState;

  // Remove the package annotation
  delete annotations[`uds.dev/pkg-${pkg.metadata.name}`];

  // Check if there are any other package annotations
  // Backwards compatibility for multiple package CRs in a single namespace
  const hasOtherPackages = Object.keys(annotations).some(key => key.startsWith("uds.dev/pkg-"));

  // Only modify Istio labels if this is the last package
  let result;
  if (hasOtherPackages) {
    // Keep existing labels if other packages are still present, don't cycle pods/change istio state
    result = { labels, shouldRestartPods: false };
  } else {
    // Set labels based on the original state and determine if pods need to be restarted
    result = getIstioLabels(labels, originalIstioState, currentState);

    // Delete the annotation since we're restoring to original state
    delete annotations[ISTIO_STATE_ANNOTATION];
  }

  // Apply the updated Namespace
  await applyNamespaceUpdates(
    pkg.metadata.namespace,
    result.labels,
    annotations,
    sourceNS.metadata?.labels,
    sourceNS.metadata?.annotations,
    `Updating namespace ${pkg.metadata.namespace}, removing ${pkg.metadata.name} state.`,
  );

  // Restart pods if needed
  await restartPodsIfNeeded(pkg.metadata.namespace, result.shouldRestartPods, originalIstioState);
}

/**
 * Forces deletion of pods with the incorrect istio sidecar state
 *
 * @param ns The namespace to target
 * @param wantSidecar Whether injection is being enabled
 */
export async function killPods(ns: string, wantSidecar: boolean) {
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

/**
 * Get the current Istio state of a namespace based on its labels
 *
 * @param labels The namespace labels
 * @returns The current Istio state
 */
export function getCurrentIstioState(labels: Record<string, string>): IstioState {
  return labels[INJECTION_LABEL] === "enabled"
    ? IstioState.Sidecar
    : labels[AMBIENT_LABEL] === "ambient"
      ? IstioState.Ambient
      : IstioState.None;
}

/**
 * Apply namespace updates if there are changes to labels or annotations
 *
 * @param namespace The namespace name
 * @param labels The updated labels
 * @param annotations The updated annotations
 * @param originalLabels The original labels
 * @param originalAnnotations The original annotations
 * @param logMessage Optional log message
 * @returns Whether updates were applied
 */
export async function applyNamespaceUpdates(
  namespace: string,
  labels: Record<string, string>,
  annotations: Record<string, string>,
  originalLabels: Record<string, string> | undefined,
  originalAnnotations: Record<string, string> | undefined,
  logMessage?: string,
): Promise<boolean> {
  const updatedNamespace = {
    metadata: {
      name: namespace,
      labels,
      annotations,
    },
  };

  if (!R.equals(originalLabels, labels) || !R.equals(originalAnnotations, annotations)) {
    log.debug(logMessage || `Applying updates to namespace ${namespace}.`);
    await K8s(kind.Namespace).Apply(updatedNamespace, { force: true });
    return true;
  } else {
    log.debug(`No namespace updates needed for ${namespace}.`);
    return false;
  }
}

/**
 * Restart pods if the Istio state has changed
 *
 * @param namespace The namespace name
 * @param shouldRestart Whether pods should be restarted
 * @param istioState The target Istio state
 */
async function restartPodsIfNeeded(
  namespace: string,
  shouldRestart: boolean,
  targetIstioState: IstioState,
): Promise<void> {
  if (shouldRestart) {
    log.debug(
      `Restarting pods in ${namespace} due to configuration changes (switching to ${targetIstioState} Istio state)`,
    );
    if (targetIstioState === IstioState.Sidecar) {
      await killPods(namespace, true);
    } else if (targetIstioState === IstioState.Ambient || targetIstioState === IstioState.None) {
      await killPods(namespace, false);
    }
  }
}

/**
 * Gets the appropriate Istio labels based on the target state and determines if pods need to be restarted
 *
 * @param labels The current labels
 * @param targetState The target Istio state
 * @param currentState The current Istio state
 * @returns Updated labels and whether pods should be restarted
 */
export function getIstioLabels(
  labels: Record<string, string>,
  targetState: IstioState,
  currentState: IstioState,
): { labels: Record<string, string>; shouldRestartPods: boolean } {
  let shouldRestartPods = false;

  if (targetState === IstioState.Sidecar) {
    labels[INJECTION_LABEL] = "enabled";
    delete labels[AMBIENT_LABEL];
    // Add sidecar if not present or coming from ambient
    if (currentState !== IstioState.Sidecar) {
      shouldRestartPods = true;
    }
  } else if (targetState === IstioState.Ambient) {
    labels[AMBIENT_LABEL] = "ambient";
    delete labels[INJECTION_LABEL];
    // Remove sidecar if present
    if (currentState === IstioState.Sidecar) {
      shouldRestartPods = true;
    }
  } else {
    // None state - remove all Istio labels
    delete labels[INJECTION_LABEL];
    delete labels[AMBIENT_LABEL];
    // Remove sidecar if present
    if (currentState === IstioState.Sidecar) {
      shouldRestartPods = true;
    }
  }

  return { labels, shouldRestartPods };
}
