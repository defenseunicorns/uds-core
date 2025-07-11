/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { GenericClass, GenericKind } from "kubernetes-fluent-client";
import { K8s, kind } from "pepr";
import { Logger } from "pino";

/**
 * Sanitize a resource name to make it a valid Kubernetes resource name.
 *
 * @param name the name of the resource to sanitize
 * @returns the sanitized resource name
 */
export function sanitizeResourceName(name: string) {
  return (
    name
      // The name must be lowercase
      .toLowerCase()
      // Replace sequences of non-alphanumeric characters with a single '-'
      .replace(/[^a-z0-9]+/g, "-")
      // Truncate the name to 250 characters
      .slice(0, 250)
      // Remove leading and trailing non-letter characters
      .replace(/^[^a-z]+|[^a-z]+$/g, "")
  );
}

/**
 * Get the owner reference for a custom resource
 * @param cr the custom resource to get the owner reference for
 * @returns the owner reference for the custom resource
 */
export function getOwnerRef(cr: GenericKind): V1OwnerReference[] {
  const { name, uid } = cr.metadata!;

  return [
    {
      apiVersion: cr.apiVersion!,
      kind: cr.kind!,
      uid: uid!,
      name: name!,
    },
  ];
}

/**
 * Purges orphaned Kubernetes resources of a specified kind within a namespace that do not match the provided generation.
 *
 * @template T
 * @param {string} generation - The generation label to retain.
 * @param {string} namespace - The namespace to search for resources.
 * @param {string} pkgName - The package name label to filter resources.
 * @param {T} kind - The Kubernetes resource kind to purge.
 * @param {Logger} log - Logger instance for logging debug messages.
 * @param {Record<string, string>} [additionalLabels] - Optional additional label filters to further narrow down the resources to purge.
 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
 */
export async function purgeOrphans<T extends GenericClass>(
  generation: string,
  namespace: string,
  pkgName: string,
  kind: T,
  log: Logger,
  additionalLabels?: Record<string, string> | undefined,
) {
  let query = K8s(kind).InNamespace(namespace).WithLabel("uds/package", pkgName);

  if (additionalLabels) {
    for (const [key, value] of Object.entries(additionalLabels)) {
      query = query.WithLabel(key, value);
    }
  }

  const resources = await query.Get();

  for (const resource of resources.items) {
    if (resource.metadata?.labels?.["uds/generation"] !== generation) {
      log.debug(resource, `Deleting orphaned ${resource.kind!} ${resource.metadata!.name}`);
      await K8s(kind).Delete(resource);
    }
  }
}

/**
 * Lightweight retry helper with a delay between attempts.
 *
 * @param {() => Promise<T>} fn - The async function to retry.
 * @param {Logger} log - Logger instance for logging debug messages.
 * @param {number} retries - Number of retry attempts.
 * @param {number} delayMs - Delay in milliseconds between attempts.
 * @returns {Promise<T>} - The result of the function if successful.
 * @throws {Error} - Throws an error after exhausting retries.
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  log: Logger,
  retries = 5,
  delayMs = 2000,
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) {
        throw err; // Exceeded retries, rethrow the error.
      }
      // We need to account for cases where we are receiving a rejected promise with undefined error
      let error = "Unknown Error";
      if (err) {
        error = `${JSON.stringify(err)}`;
        // Error responses from network calls (i.e. K8s().Get() will be this shape)
        if (err.data?.message) {
          error = err.data.message;
          // Other error types have a message
        } else if (err.message) {
          error = err.message;
        }
      }
      log.warn(
        `Attempt ${attempt} of ${fn.name || "anonymous function"} failed, retrying in ${delayMs}ms.`,
        { error },
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // This line should never be reached, but TypeScript wants it for safety.
  throw new Error("Retry loop exited unexpectedly without returning.");
}

/**
 * Reload a list of pods using controller-based rolling restart when possible,
 * falling back to direct pod eviction when necessary.
 *
 * For Deployments, StatefulSets, DaemonSets, and ReplicaSets, it will trigger a
 * rolling restart by patching the controller with a restartedAt annotation.
 *
 * For standalone pods or when controller handling fails, it will use direct pod eviction.
 *
 * @param namespace The namespace containing the pods
 * @param pods List of pods to evict or restart
 * @param reason The reason for eviction/restart (for logging)
 * @param log Logger instance for logging
 */
export async function reloadPods(namespace: string, pods: kind.Pod[], reason: string, log: Logger) {
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
        await handleReplicaSetOwner(namespace, controllerRef.name, reason, log);
      } else if (controllerRef.kind === "Deployment") {
        // Handle Deployment directly
        await restartController(namespace, kind.Deployment, controllerRef.name, reason, log);
      } else if (controllerRef.kind === "StatefulSet") {
        // Handle StatefulSet directly
        await restartController(namespace, kind.StatefulSet, controllerRef.name, reason, log);
      } else if (controllerRef.kind === "DaemonSet") {
        // Handle DaemonSet directly
        await restartController(namespace, kind.DaemonSet, controllerRef.name, reason, log);
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
        `Failed to handle controller for pod: ${reason}`,
      );
    }
  }

  // Now handle any standalone pods with direct eviction
  if (standalonePodsToEvict.length > 0) {
    await evictStandalonePods(namespace, standalonePodsToEvict, reason, log);
  }
}

/**
 * Handle ReplicaSet by finding its parent Deployment or handling it directly
 */
async function handleReplicaSetOwner(
  namespace: string,
  replicaSetName: string,
  reason: string,
  logger: Logger,
): Promise<void> {
  try {
    // Get the ReplicaSet
    const rs = await K8s(kind.ReplicaSet).InNamespace(namespace).Get(replicaSetName);

    // Look for a Deployment owner
    const deploymentOwner = rs.metadata?.ownerReferences?.find(ref => ref.kind === "Deployment");

    if (deploymentOwner?.name) {
      // Found a Deployment owner, restart it
      await restartController(namespace, kind.Deployment, deploymentOwner.name, reason, logger);
    } else {
      // Standalone ReplicaSet - restart it directly using the same annotation pattern
      await restartController(namespace, kind.ReplicaSet, replicaSetName, reason, logger);
    }
  } catch (error) {
    logger.error(
      { replicaSet: replicaSetName, namespace, error },
      `Failed to handle ReplicaSet owner: ${reason}`,
    );
    throw error;
  }
}

/**
 * Create a Kubernetes event for a resource
 *
 * @param resource The Kubernetes resource to create an event for
 * @param event Partial event object with optional type, reason, message, etc.
 * @param logger Logger instance for logging
 */
export async function createEvent(
  resource: GenericKind,
  event: Partial<kind.CoreEvent> = {},
  logger: Logger,
): Promise<void> {
  const name = resource.metadata?.name;
  const namespace = resource.metadata?.namespace;
  const resourceKind = resource.kind;

  if (!name || !namespace || !resourceKind) {
    const error = new Error("Cannot create event: resource missing name, namespace, or kind");
    logger.error(error.message);
    throw error;
  }

  // Create the event using CoreEvent type
  await K8s(kind.CoreEvent).Create({
    // Default values that can be overridden
    type: "Normal",
    reason: "Update",
    // User provided overrides
    ...event,
    // Fixed values that cannot be overridden
    metadata: {
      namespace,
      generateName: name,
    },
    involvedObject: {
      apiVersion: resource.apiVersion,
      kind: resourceKind,
      name,
      namespace,
      uid: resource.metadata?.uid,
    },
    firstTimestamp: new Date(),
    reportingComponent: "uds.dev/operator",
    reportingInstance: process.env.HOSTNAME,
  });
}

/**
 * Restart a controller (Deployment, StatefulSet, DaemonSet, ReplicaSet) using the kubectl-style annotation
 */
export async function restartController(
  namespace: string,
  controllerKind: GenericClass,
  name: string,
  reason: string,
  logger: Logger,
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

  try {
    // Use a targeted JSON patch to add/update the annotation without needing to get the resource first
    await K8s(controllerKind, { name, namespace }).Patch([
      {
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: new Date().toISOString(),
      },
    ]);
  } catch (error) {
    logger.error(
      { controller: controllerKindName, name, namespace, error },
      `Failed to patch ${controllerKindName} controller: ${reason}`,
    );
    throw error;
  }

  try {
    // Get the controller resource for the event
    const controller = await K8s(controllerKind).InNamespace(namespace).Get(name);

    // Create an event for this controller restart
    await createEvent(
      controller,
      {
        type: "Normal",
        reason: "SecretChanged",
        message: `Restarted due to: ${reason}`,
      },
      logger,
    );
  } catch (error) {
    logger.error(
      { controller: controllerKindName, name, namespace, error },
      `Controller ${controllerKindName}/${name} was restarted, but failed to create event notification`,
    );
    // Don't rethrow this error since the patch was successful
  }

  // Log success if we got here (patch was successful)
  logger.info(
    { controller: controllerKindName, name, namespace },
    `Successfully restarted ${controllerKindName} controller: ${reason}`,
  );
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
        await K8s(kind.Pod).InNamespace(namespace).Evict(pod.metadata!.name!);
        log.info(`Successfully evicted pod ${namespace}/${pod.metadata?.name}`);
      } catch (err) {
        // Fall back to Delete with grace period if Evict fails
        log.warn(
          `Failed to evict pod ${namespace}/${pod.metadata?.name} using Evict API, falling back to Delete: ${err.message}`,
        );
        try {
          await K8s(kind.Pod).Delete(pod);
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
