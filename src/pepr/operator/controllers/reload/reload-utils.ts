/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { GenericClass } from "kubernetes-fluent-client";
import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { createEvent, retryWithDelay } from "../utils.js";

/**
 * Reload a list of pods using controller-based rolling restart when possible,
 * falling back to direct pod eviction when necessary.
 *
 * For Deployments, StatefulSets, DaemonSets, and ReplicaSets, it will trigger a
 * rolling restart by apply an update to the controller with a restartedAt annotation.
 *
 * For standalone pods or when controller handling fails, it will use direct pod eviction.
 *
 * @param namespace The namespace containing the pods
 * @param pods List of pods to evict or restart
 * @param message The reason for eviction/restart (for logging)
 * @param log Logger instance for logging
 * @param reason Resource type responsible for eviction/restart (for logging)
 */
export async function reloadPods(
  namespace: string,
  pods: kind.Pod[],
  message: string,
  log: Logger,
  reason: string,
) {
  if (pods.length === 0) {
    log.warn(`No pods provided for eviction in namespace ${namespace}`);
    return;
  }

  log.info(`Processing ${pods.length} pods for restart/eviction in namespace ${namespace}`);

  // Track which controllers we've already handled to avoid duplicate restarts
  const handledControllers: Record<string, boolean> = {};
  const standalonePodsToEvict: kind.Pod[] = [];

  // First pass - identify controllers and standalone pods
  for (const pod of pods) {
    // Skip pods that don't need to be reloaded (succeeded or failed pods are not automatically restarted)
    const phase = pod.status?.phase;
    if (phase === "Succeeded" || phase === "Failed") {
      log.debug(`Ignoring Pod ${namespace}/${pod.metadata?.name} (phase: ${phase})`);
      continue;
    }
    // Skip pods that already have a deletion timestamp
    if (pod.metadata?.deletionTimestamp) {
      log.debug(`Ignoring Pod ${namespace}/${pod.metadata?.name}, already being deleted`);
      continue;
    }

    const ownerRefs = pod.metadata?.ownerReferences || [];
    const controllerRef = ownerRefs.find(ref => ref.controller === true);

    if (!controllerRef) {
      // No controller reference, handle as standalone pod
      standalonePodsToEvict.push(pod);
      continue;
    }

    // Build a unique key for this controller to avoid duplicate handling
    const controllerKey = `${controllerRef.kind}:${controllerRef.name}`;
    if (handledControllers[controllerKey]) {
      // We've already processed this controller
      continue;
    }

    try {
      if (controllerRef.kind === "ReplicaSet") {
        // For ReplicaSets, try to find the parent Deployment
        await handleReplicaSetOwner(namespace, controllerRef.name, message, log, reason);
      } else if (controllerRef.kind === "Deployment") {
        // Handle Deployment directly
        await restartController(
          namespace,
          kind.Deployment,
          controllerRef.name,
          message,
          log,
          reason,
        );
      } else if (controllerRef.kind === "StatefulSet") {
        // Handle StatefulSet directly
        await restartController(
          namespace,
          kind.StatefulSet,
          controllerRef.name,
          message,
          log,
          reason,
        );
      } else if (controllerRef.kind === "DaemonSet") {
        // Handle DaemonSet directly
        await restartController(
          namespace,
          kind.DaemonSet,
          controllerRef.name,
          message,
          log,
          reason,
        );
      } else {
        // Unhandled controller type, evict the pod directly
        standalonePodsToEvict.push(pod);
        continue;
      }

      // Mark this controller as handled
      handledControllers[controllerKey] = true;
    } catch (error) {
      log.error(
        {
          pod: pod.metadata?.name,
          namespace,
          controller: controllerRef.kind,
          controllerName: controllerRef.name,
          error,
        },
        `Failed to handle controller for pod: ${message}`,
      );
    }
  }

  // Now handle any standalone pods with direct eviction
  if (standalonePodsToEvict.length > 0) {
    await evictStandalonePods(namespace, standalonePodsToEvict, message, log);
  }
}

/**
 * Handle ReplicaSet by finding its parent Deployment or handling it directly
 */
async function handleReplicaSetOwner(
  namespace: string,
  replicaSetName: string,
  message: string,
  log: Logger,
  reason: string,
): Promise<void> {
  try {
    // Get the ReplicaSet
    async function getReplicaSet() {
      return K8s(kind.ReplicaSet).InNamespace(namespace).Get(replicaSetName);
    }
    const rs = await retryWithDelay(getReplicaSet, log);

    // Look for a Deployment owner
    const deploymentOwner = rs.metadata?.ownerReferences?.find(ref => ref.kind === "Deployment");

    if (deploymentOwner?.name) {
      // Found a Deployment owner, restart it
      await restartController(
        namespace,
        kind.Deployment,
        deploymentOwner.name,
        message,
        log,
        reason,
      );
    } else {
      // Standalone ReplicaSet - restart it directly using the same annotation pattern
      await restartController(namespace, kind.ReplicaSet, replicaSetName, message, log, reason);
    }
  } catch (error) {
    log.error(
      { replicaSet: replicaSetName, namespace, error },
      `Failed to handle ReplicaSet owner: ${message}`,
    );
    throw error;
  }
}

/**
 * Restart a controller (Deployment, StatefulSet, DaemonSet, ReplicaSet) using the kubectl-style annotation
 */
export async function restartController(
  namespace: string,
  controllerKind: GenericClass,
  name: string,
  message: string,
  log: Logger,
  reason: string,
): Promise<void> {
  // Get the controller kind name for logging
  const controllerKindName = controllerKind?.name ?? String(controllerKind);

  // Create a list of allowed controller kinds
  const allowedKinds = [kind.Deployment, kind.StatefulSet, kind.DaemonSet, kind.ReplicaSet];

  // Check if the provided kind is in our allowed list
  // We use strict equality to check if it's the same object reference
  const isAllowedKind = allowedKinds.some(k => k === controllerKind);

  if (!isAllowedKind) {
    throw new Error(`Unsupported controller kind: ${controllerKindName}`);
  }

  // Get the controller resource for the event
  async function getController() {
    return K8s(controllerKind).InNamespace(namespace).Get(name);
  }
  const controller = await retryWithDelay(getController, log);

  try {
    // Setup parent fields if any are missing to ensure our apply doesn't hit errors
    if (!controller.spec) controller.spec = {};
    if (!controller.spec.template) controller.spec.template = {};
    if (!controller.spec.template.metadata) controller.spec.template.metadata = {};
    if (!controller.spec.template.metadata.annotations)
      controller.spec.template.metadata.annotations = {};
    controller.spec.template.metadata.annotations["uds.dev/restartedAt"] = new Date().toISOString();
    // Clear managedFields before apply
    delete controller.metadata?.managedFields;

    // Update the annotation in the controller object and apply
    async function applyControllerAnnotation() {
      return K8s(controllerKind, { name, namespace }).Apply(controller);
    }
    await retryWithDelay(applyControllerAnnotation, log);
  } catch (error) {
    log.error(
      { controller: controllerKindName, name, namespace, error },
      `Failed to apply ${controllerKindName} controller update: ${message}`,
    );
    throw error;
  }

  try {
    // Create an event for this controller restart
    async function createControllerEvent() {
      return createEvent(
        controller,
        {
          type: "Normal",
          reason: `${reason}`,
          message: `Restarted due to: ${message}`,
        },
        log,
      );
    }
    await retryWithDelay(createControllerEvent, log);
  } catch (error) {
    log.warn(
      { controller: controllerKindName, name, namespace, error },
      `Controller ${controllerKindName}/${name} was restarted, but failed to create event notification`,
    );
    // Don't rethrow this error since the apply was successful
  }

  // Log success if we got here (apply was successful)
  log.info(`Successfully restarted ${controllerKindName} ${namespace}/${name}: ${message}`);
}

/**
 * Evict standalone pods directly using the Evict API with fallback to Delete
 */
export async function evictStandalonePods(
  namespace: string,
  pods: kind.Pod[],
  reason: string,
  log: Logger,
) {
  if (pods.length === 0) return;

  log.info(`Directly evicting ${pods.length} standalone pods in namespace ${namespace}`);

  // Group pods by owner UID for ordered eviction (handling StatefulSets differently)
  const groups: Record<string, kind.Pod[]> = {};

  for (const pod of pods) {
    // Get the UID of the owner of the pod or default to "other"
    const controlledBy =
      pod.metadata?.ownerReferences?.find((ref: V1OwnerReference) => ref.controller)?.uid ||
      "other";
    groups[controlledBy] = groups[controlledBy] || [];
    groups[controlledBy].push(pod);
  }

  // Evict each group of pods
  for (const group of Object.values(groups)) {
    for (const pod of group) {
      log.info(`Evicting pod ${namespace}/${pod.metadata?.name} due to ${reason}`);

      try {
        // Try to use the Evict API
        async function evictPod() {
          return K8s(kind.Pod).InNamespace(namespace).Evict(pod.metadata!.name!);
        }
        await retryWithDelay(evictPod, log);
        log.info(`Successfully evicted pod ${namespace}/${pod.metadata?.name}`);
      } catch (err) {
        // Fall back to Delete with grace period if Evict fails
        log.warn(
          `Failed to evict pod ${namespace}/${pod.metadata?.name} using Evict API, falling back to Delete: ${err.message}`,
        );
        try {
          async function deletePod() {
            return K8s(kind.Pod).Delete(pod);
          }
          await retryWithDelay(deletePod, log);
          log.info(
            `Successfully initiated graceful deletion of pod ${namespace}/${pod.metadata?.name}`,
          );
        } catch (deleteErr) {
          log.error(
            `Failed to delete pod ${namespace}/${pod.metadata?.name}: ${deleteErr.message}`,
          );
        }
      }
    }
  }
}
