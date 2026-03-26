/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { createHash } from "crypto";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { retryWithDelay } from "../utils";
import { cleanupOverClaimedControllerFields, reloadPods } from "./reload-utils";

const log = setupLogger(Component.OPERATOR_SECRETS);

// Define resource types
export type ResourceType = "Secret" | "ConfigMap";

// Maps to store resource checksums for change detection
// Exported for testing purposes
export const secretChecksumCache = new Map<string, string>();
export const configMapChecksumCache = new Map<string, string>();

// Annotation set on a Secret/ConfigMap after its backing controllers have been cleaned up.
// Prevents re-running the cleanup on every controller restart.
export const SSA_CLEANUP_ANNOTATION = "uds.dev/pod-reload-cleanup-complete";

// Serializes first-observation cleanup calls to avoid thundering-herd API pressure on startup.
// Exported for testing so specs can await it after calling a handler.
export let startupCleanupQueue: Promise<void> = Promise.resolve();

/**
 * Computes a SHA256 checksum of the resource data
 *
 * @param data The resource data to compute the checksum for
 * @returns A hex-encoded SHA256 checksum
 */
export function computeResourceChecksum(data: Record<string, string>): string {
  // Sort keys to ensure consistent hashing regardless of key order
  const sortedKeys = Object.keys(data).sort();
  const hash = createHash("sha256");

  // Add each key-value pair to the hash
  for (const key of sortedKeys) {
    hash.update(`${key}=${data[key]}`);
  }

  return hash.digest("hex");
}

/**
 * Auto-discovers pods that use the given secret
 *
 * @param namespace Namespace of the secret
 * @param secretName Name of the secret
 * @returns Array of pods that mount or reference the secret
 */
export async function discoverSecretConsumers(namespace: string, secretName: string) {
  // Get all pods in the namespace
  const pods = await K8s(kind.Pod).InNamespace(namespace).Get();

  // Filter pods that use the secret either as a volume or env var source
  return pods.items.filter(pod => {
    if (!pod.spec) return false;

    // Check volume mounts for direct secret volumes
    const usesSecretVolume = pod.spec.volumes?.some(
      volume => volume.secret && volume.secret.secretName === secretName,
    );
    if (usesSecretVolume) return true;

    // Check for projected volumes that include the secret
    const usesProjectedSecretVolume = pod.spec.volumes?.some(volume =>
      volume.projected?.sources?.some(source => source.secret?.name === secretName),
    );
    if (usesProjectedSecretVolume) return true;

    // Check environment variables
    const containers = [...(pod.spec.containers || []), ...(pod.spec.initContainers || [])];
    const usesSecretEnv = containers.some(
      container =>
        container.env?.some(env => env.valueFrom?.secretKeyRef?.name === secretName) ||
        container.envFrom?.some(envFrom => envFrom.secretRef?.name === secretName),
    );

    return usesSecretEnv;
  });
}

/**
 * Parse a key=value selector string from an annotation
 * @param value The string value to parse (format: "key1=value1,key2=value2")
 * @returns The parsed object or null if invalid
 */
export function parseSelectorString(value: string): Record<string, string> | null {
  try {
    // Handle key=value format (like "app=falco-pod")
    const result: Record<string, string> = {};

    // Split by commas if multiple key=value pairs
    const pairs = value.split(",");

    for (const pair of pairs) {
      const [key, val] = pair.trim().split("=");
      if (key && val) {
        result[key.trim()] = val.trim();
      } else {
        // Invalid format
        return null;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Auto-discovers pods that use the given ConfigMap
 *
 * @param namespace Namespace of the ConfigMap
 * @param configMapName Name of the ConfigMap
 * @returns Array of pods that mount or reference the ConfigMap
 */
export async function discoverConfigMapConsumers(namespace: string, configMapName: string) {
  // Get all pods in the namespace
  const pods = await K8s(kind.Pod).InNamespace(namespace).Get();

  // Filter pods that use the ConfigMap either as a volume or env var source
  return pods.items.filter(pod => {
    if (!pod.spec) return false;

    // Check volume mounts for direct ConfigMap volumes
    const usesConfigMapVolume = pod.spec.volumes?.some(
      volume => volume.configMap && volume.configMap.name === configMapName,
    );
    if (usesConfigMapVolume) return true;

    // Check for projected volumes that include the ConfigMap
    const usesProjectedConfigMapVolume = pod.spec.volumes?.some(volume =>
      volume.projected?.sources?.some(source => source.configMap?.name === configMapName),
    );
    if (usesProjectedConfigMapVolume) return true;

    // Check environment variables
    const containers = [...(pod.spec.containers || []), ...(pod.spec.initContainers || [])];
    const usesConfigMapEnv = containers.some(
      container =>
        container.env?.some(env => env.valueFrom?.configMapKeyRef?.name === configMapName) ||
        container.envFrom?.some(envFrom => envFrom.configMapRef?.name === configMapName),
    );

    return usesConfigMapEnv;
  });
}

/**
 * Generic function to handle resource updates (Secret or ConfigMap)
 *
 * @param resource The Kubernetes resource that was updated
 * @param checksumCache The cache to use for this resource type
 * @param discoverResourceConsumers Function to discover pods using this resource
 * @param resourceType Type of resource ("Secret" or "ConfigMap")
 */
export async function handleResourceUpdate(
  resource: kind.Secret | kind.ConfigMap,
  checksumCache: Map<string, string>,
  discoverResourceConsumers: (namespace: string, name: string) => Promise<kind.Pod[]>,
  resourceType: ResourceType,
) {
  if (!resource.metadata?.name || !resource.metadata?.namespace) {
    return;
  }

  const { name, namespace } = resource.metadata;
  const cacheKey = `${namespace}/${name}`;

  // Use an empty object if data is undefined or null
  const data = resource.data || {};

  // Compute checksum of the current resource data
  const currentChecksum = computeResourceChecksum(data);

  // Check if we've seen this resource before
  const previousChecksum = checksumCache.get(cacheKey);

  // Update the cache regardless of whether we process this update
  checksumCache.set(cacheKey, currentChecksum);

  // First time we've seen this resource — proactively clean up any over-claimed controller
  // fields so Helm upgrades don't conflict before the first reload fires.
  if (!previousChecksum) {
    // Already cleaned up on a prior run — skip entirely.
    if (resource.metadata?.annotations?.[SSA_CLEANUP_ANNOTATION]) {
      return;
    }

    // Chain onto the queue so concurrent first-observation events on startup
    // run sequentially rather than fanning out parallel API calls.
    startupCleanupQueue = startupCleanupQueue
      .then(async () => {
        const pods = await discoverResourceConsumers(namespace, name);
        await cleanupOverClaimedControllerFields(namespace, pods, log);
        // Mark complete so future restarts skip this work entirely.
        // Use JSON Patch (not SSA Apply) so we don't affect field ownership — an SSA Apply
        // that omits `data` would cause Kubernetes to drop any fields Pepr previously owned
        // (e.g. the CA cert in uds-trust-bundle).
        try {
          const kindClass = resourceType === "Secret" ? kind.Secret : kind.ConfigMap;
          // RFC 6901 JSON Pointer encoding: ~ → ~0, / → ~1
          const annotationPath = `/metadata/annotations/${SSA_CLEANUP_ANNOTATION.replace(/~/g, "~0").replace(/\//g, "~1")}`;
          await K8s(kindClass, { name, namespace }).Patch([
            { op: "add", path: annotationPath, value: "true" },
          ]);
        } catch (annotationErr) {
          log.warn(
            { resource: name, namespace, type: resourceType, annotationErr },
            "Failed to mark cleanup complete; will retry on next restart",
          );
        }
      })
      .catch(err =>
        log.warn(
          { resource: name, namespace, type: resourceType, err },
          "Field manager cleanup failed",
        ),
      );
    return;
  }

  // Data unchanged — nothing to do
  if (previousChecksum === currentChecksum) {
    return;
  }

  log.info(
    { resource: name, namespace, type: resourceType },
    `${resourceType} data changed, processing pod reload`,
  );

  // Determine which pods to reload based on the strategy
  let podsToReload: kind.Pod[] = [];

  // Check if we have an explicit pod selector in annotations
  const selectorStr = resource.metadata?.annotations?.["uds.dev/pod-reload-selector"];

  if (selectorStr) {
    const selector = parseSelectorString(selectorStr);
    if (!selector) {
      const errorMsg = `Invalid selector format in uds.dev/pod-reload-selector annotation for ${resourceType.toLowerCase()} ${namespace}/${name}: ${selectorStr}. Expected format: key1=value1,key2=value2`;
      log.error({ resource: name, namespace, selector: selectorStr, type: resourceType }, errorMsg);
      return;
    }

    log.debug(
      { resource: name, namespace, selector, type: resourceType },
      `Using explicit pod selector from ${resourceType.toLowerCase()} annotation for reload`,
    );

    // Build query with each label
    let podQuery = K8s(kind.Pod).InNamespace(namespace);
    for (const [key, value] of Object.entries(selector)) {
      podQuery = podQuery.WithLabel(key, value);
    }

    try {
      async function getPodsWithSelector() {
        return podQuery.Get();
      }

      const pods = await retryWithDelay(getPodsWithSelector, log);
      podsToReload = pods.items;
    } catch (error) {
      log.error(
        { resource: name, namespace, selector, error, type: resourceType },
        `Failed to get pods using selector from ${resourceType.toLowerCase()} annotation`,
      );
      return;
    }
  } else {
    // No explicit selector, use auto-discovery
    log.debug(
      { resource: name, namespace, type: resourceType },
      `Auto-discovering ${resourceType.toLowerCase()} consumers`,
    );
    try {
      async function getPodsUsingResource() {
        return discoverResourceConsumers(namespace, name);
      }
      podsToReload = await retryWithDelay(getPodsUsingResource, log);
    } catch (error) {
      log.error(
        { resource: name, namespace, error, type: resourceType },
        `Failed to discover ${resourceType.toLowerCase()} consumers`,
      );
      return;
    }
  }

  // If no pods found, log and exit
  if (podsToReload.length === 0) {
    log.warn(
      { resource: name, namespace, type: resourceType },
      `No pods found to reload for ${resourceType.toLowerCase()} change`,
    );
    return;
  }

  // Reload the pods
  log.info(
    { resource: name, namespace, podCount: podsToReload.length, type: resourceType },
    `Reloading ${podsToReload.length} pods due to ${resourceType.toLowerCase()} change`,
  );

  try {
    await reloadPods(
      namespace,
      podsToReload,
      `${resourceType} ${name} change`,
      log,
      `${resourceType}Changed`,
    );
  } catch (error) {
    log.error(
      { resource: name, namespace, podCount: podsToReload.length, error, type: resourceType },
      `Failed to reload pods after ${resourceType.toLowerCase()} change`,
    );
    return;
  }
}

/**
 * Generic function to handle resource deletion (Secret or ConfigMap)
 *
 * @param resource The Kubernetes resource that was deleted
 * @param checksumCache The cache to use for this resource type
 */
export function handleResourceDelete(
  resource: kind.Secret | kind.ConfigMap,
  checksumCache: Map<string, string>,
) {
  if (!resource.metadata?.name || !resource.metadata?.namespace) {
    return;
  }

  const { name, namespace } = resource.metadata;
  const cacheKey = `${namespace}/${name}`;

  // Clean up the cache entry
  checksumCache.delete(cacheKey);
}

/**
 * Handles a secret update event
 *
 * @param secret The Kubernetes secret that was updated
 */
export async function handleSecretUpdate(secret: kind.Secret) {
  await handleResourceUpdate(secret, secretChecksumCache, discoverSecretConsumers, "Secret");
}

/**
 * Handles a secret deletion event
 *
 * @param secret The Kubernetes secret that was deleted
 */
export function handleSecretDelete(secret: kind.Secret) {
  handleResourceDelete(secret, secretChecksumCache);
}

/**
 * Handles a ConfigMap update event
 *
 * @param configMap The Kubernetes ConfigMap that was updated
 */
export async function handleConfigMapUpdate(configMap: kind.ConfigMap) {
  await handleResourceUpdate(
    configMap,
    configMapChecksumCache,
    discoverConfigMapConsumers,
    "ConfigMap",
  );
}

/**
 * Handles a ConfigMap deletion event
 *
 * @param configMap The Kubernetes ConfigMap that was deleted
 */
export function handleConfigMapDelete(configMap: kind.ConfigMap) {
  handleResourceDelete(configMap, configMapChecksumCache);
}
