import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

const injectionLabel = "istio-injection";
const injectionAnnotation = "uds.dev/original-istio-injection";

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
  const originalInjectionLabel = labels[injectionLabel];
  const annotations = sourceNS.metadata?.annotations || {};
  const pkgKey = `uds.dev/pkg-${pkg.metadata.name}`;

  // Mark the original namespace injection setting for if all packages are removed
  if (!annotations[injectionAnnotation]) {
    annotations[injectionAnnotation] = originalInjectionLabel || "non-existent";
  }

  // Ensure the namespace is configured
  if (!annotations[pkgKey] || originalInjectionLabel !== "enabled") {
    // Ensure Istio injection is enabled
    labels[injectionLabel] = "enabled";

    // Add the package annotation
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

    // Kill the pods if we changed the value of the istio-injection label
    if (originalInjectionLabel !== labels[injectionLabel]) {
      log.debug(
        `Attempting pod restart in ${pkg.metadata.namespace} based on istio injection label change`,
      );
      await killPods(pkg.metadata.namespace, true);
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

  // Group the pods by owner UID
  for (const pod of pods.items) {
    // Ignore pods that already have a deletion timestamp
    if (pod.metadata?.deletionTimestamp) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, already being deleted`);
      continue;
    }

    const foundSidecar = pod.spec?.containers?.find(c => c.name === "istio-proxy");

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
      log.info(`Deleting pod ${ns}/${pod.metadata?.name} to enable the istio sidecar`);
      await K8s(kind.Pod).Delete(pod);
    }
  }
}
