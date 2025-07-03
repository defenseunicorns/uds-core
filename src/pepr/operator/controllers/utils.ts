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
 * Evicts a list of pods using the Evict API with fallback to Delete
 *
 * @param namespace The namespace containing the pods
 * @param pods List of pods to evict
 * @param reason The reason for eviction (for logging)
 * @param log Logger instance for logging
 */
export async function evictPods(namespace: string, pods: kind.Pod[], reason: string, log: Logger) {
  if (pods.length === 0) {
    log.warn(`No pods provided for eviction in namespace ${namespace}`);
    return;
  }

  log.info(`Evicting ${pods.length} pods in namespace ${namespace}`);

  // Group pods by owner UID for ordered eviction
  const groups: Record<string, kind.Pod[]> = {};

  for (const pod of pods) {
    // Ignore pods that already have a deletion timestamp
    if (pod.metadata?.deletionTimestamp) {
      log.debug(`Ignoring Pod ${namespace}/${pod.metadata?.name}, already being deleted`);
      continue;
    }

    // Get the UID of the owner of the pod or default to "other"
    const controlledBy =
      pod.metadata?.ownerReferences?.find((ref: V1OwnerReference) => ref.controller)?.uid ||
      "other";
    groups[controlledBy] = groups[controlledBy] || [];
    groups[controlledBy].push(pod);
  }

  // Evict each group of pods
  for (const group of Object.values(groups)) {
    // If this is a statefulset, evict the pods in reverse name order
    if (
      group[0].metadata?.ownerReferences?.find(
        (ref: V1OwnerReference) => ref.kind === "StatefulSet",
      )
    ) {
      group.sort((a, b) => (b.metadata?.name || "").localeCompare(a.metadata?.name || ""));
    }

    for (const pod of group) {
      log.info(`Evicting pod ${namespace}/${pod.metadata?.name} due to ${reason}`);

      try {
        // Try to use the Evict API
        await K8s(kind.Pod).Evict(pod);
        log.info(`Successfully evicted pod ${namespace}/${pod.metadata?.name}`);
      } catch (err) {
        // Fall back to Delete with grace period if Evict fails
        log.warn(
          `Failed to evict pod ${namespace}/${pod.metadata?.name} using Evict API, falling back to Delete: ${err.message}`,
        );
        try {
          pod.metadata!.deletionGracePeriodSeconds = 30;
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
