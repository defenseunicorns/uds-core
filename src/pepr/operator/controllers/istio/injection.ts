/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { KubernetesGateway, UDSPackage } from "../../crd";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

const INJECTION_LABEL = "istio-injection";
const AMBIENT_LABEL = "istio.io/dataplane-mode";
const WAYPOINT_LABEL = "istio.io/use-waypoint";
const originalStateAnnotation = "uds.dev/original-istio-state";

enum IstioState {
  Injected = "injected",
  Ambient = "ambient",
  None = "none",
}

function getOriginalIstioState(ns: kind.Namespace): IstioState {
  // Extract labels from the namespace
  const labels = ns.metadata?.labels || {};

  // Extract the relevant label values
  const originalInjectionLabelValue = labels[INJECTION_LABEL];
  const originalAmbientLabelValue = labels[AMBIENT_LABEL];

  // Determine the original Istio state based on specific label values
  let istioState: IstioState;

  if (originalInjectionLabelValue === "enabled") {
    istioState = IstioState.Injected;
  } else if (originalAmbientLabelValue === "ambient") {
    istioState = IstioState.Ambient;
  } else {
    istioState = IstioState.None;
  }

  return istioState;
}

function needsKill(originalIstioState: IstioState, desiredIstioState: IstioState): boolean {
  return (
    (originalIstioState !== desiredIstioState && originalIstioState === IstioState.Injected) ||
    desiredIstioState === IstioState.Injected
  );
}

/**
 * Syncs the package namespace istio state and adds a label for the package name
 *
 * @param pkg
 */
export async function enableIstio(pkg: UDSPackage) {
  log.info(`Enabling Istio for package`);
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const annotations = sourceNS.metadata?.annotations || {};
  const pkgKey = `uds.dev/pkg-${pkg.metadata.name}`;
  const desiredIstioState = pkg.spec!.istioAmbient ? IstioState.Ambient : IstioState.Injected;

  // Mark the original namespace injection setting for if all packages are removed
  const originalIstioState = getOriginalIstioState(sourceNS);
  if (!annotations[originalStateAnnotation]) {
    annotations[originalStateAnnotation] = originalIstioState;
  }

  // Ensure the namespace is configured
  if (!annotations[pkgKey] || originalIstioState !== desiredIstioState) {
    // Add the package annotation
    annotations[pkgKey] = "true";

    labels[AMBIENT_LABEL] = desiredIstioState === IstioState.Ambient ? "ambient" : "none";
    labels[INJECTION_LABEL] = desiredIstioState === IstioState.Ambient ? "disabled" : "enabled";
    if (desiredIstioState === IstioState.Ambient) {
      labels[WAYPOINT_LABEL] = "waypoint";
      await createWaypoint(pkg.metadata.namespace);
    }

    // Apply the updated Namespace
    log.debug(`Updating namespace ${pkg.metadata.namespace} with istio labels`);
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

    // Kill the pods if we are switching istio modes
    if (needsKill(originalIstioState, desiredIstioState)) {
      log.debug(`Attempting pod restart in ${pkg.metadata.namespace} based on istio state change`);
      await killPods(pkg.metadata.namespace, desiredIstioState);
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
  const annotations = sourceNS.metadata?.annotations || {};
  const originalIstioState = getOriginalIstioState(sourceNS);

  // Remove the package annotation
  delete annotations[`uds.dev/pkg-${pkg.metadata.name}`];

  // If there are no more UDS Package annotations, restore the original value of the istio-injection label
  const desiredIstioState = annotations[originalStateAnnotation] as IstioState;
  if (!Object.keys(annotations).find(key => key.startsWith("uds.dev/pkg-"))) {
    switch (desiredIstioState) {
      case IstioState.Ambient:
        labels[AMBIENT_LABEL] = "ambient";
        labels[INJECTION_LABEL] = "disabled";
        break;
      case IstioState.Injected:
        labels[AMBIENT_LABEL] = "none";
        labels[INJECTION_LABEL] = "enabled";
        break;
      case IstioState.None:
        labels[AMBIENT_LABEL] = "none";
        labels[INJECTION_LABEL] = "disabled";
        break;
    }
    delete annotations[originalStateAnnotation];
  }

  // Apply the updated Namespace
  log.debug(`Updating namespace ${pkg.metadata.namespace}, applying original istio state labels.`);
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

  // Kill the pods if we changed the istio state
  if (needsKill(originalIstioState, desiredIstioState)) {
    log.debug(`Attempting pod restart in ${pkg.metadata.namespace} based on istio state change`);
    await killPods(pkg.metadata.namespace, desiredIstioState);
  }
}

/**
 * Forces deletion of pods with the incorrect istio sidecar state
 *
 * @param ns
 * @param enableInjection
 */
async function killPods(ns: string, desiredIstioState: string) {
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
    if (desiredIstioState === IstioState.Injected && foundSidecar) {
      log.debug(`Ignoring Pod ${ns}/${pod.metadata?.name}, already has sidecar`);
      continue;
    }

    // If disabling injection, ignore pods that don't have the istio sidecar
    if (desiredIstioState !== IstioState.Injected && !foundSidecar) {
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
      log.info(`Deleting pod ${ns}/${pod.metadata?.name} to switch to ${desiredIstioState} mode`);
      await K8s(kind.Pod).Delete(pod);
    }
  }
}

/*
* Create the Waypoint Gateway for ambient mode
*
* @param ns
*/
async function createWaypoint(ns: string) {
  log.info(`Creating Waypoint Gateway`);
  const gateway: KubernetesGateway = {
    apiVersion: "gateway.networking.k8s.io/v1",
    kind: "Gateway",
    metadata: {
      name: "waypoint",
      namespace: ns,
    },
    spec: {
      gatewayClassName: "istio-waypoint",
      listeners: [
        {
          name: "mesh",
          port: 15008,
          protocol: "HBONE",
        }
      ]
    }
  };
  await K8s(KubernetesGateway).Apply(gateway, { force: true });
  log.info(`Waypoint Gateway created`);
}