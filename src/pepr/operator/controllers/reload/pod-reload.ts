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

// Annotations used to persist reload state across operator restarts.
export const POD_RELOAD_CHECKSUM_ANNOTATION = "uds.dev/pod-reload-checksum";
export const POD_RELOAD_PENDING_ANNOTATION = "uds.dev/pod-reload-pending";
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

type JsonPatchOperation =
  | {
      op: "add" | "test";
      path: string;
      value: unknown;
    }
  | {
      op: "remove";
      path: string;
    };

function annotationPath(annotation: string) {
  const escaped = annotation.replace(/~/g, "~0").replace(/\//g, "~1");
  return `/metadata/annotations/${escaped}`;
}

async function saveResourceState(
  resource: kind.Secret | kind.ConfigMap,
  resourceType: ResourceType,
  checksum: string,
  markCleanupComplete: boolean,
) {
  const metadata = resource.metadata;
  if (!metadata?.name || !metadata.namespace) {
    return;
  }

  const { name, namespace, resourceVersion, annotations } = metadata;
  if (!resourceVersion) {
    throw new Error(
      `Cannot save pod reload state for ${namespace}/${name} without resourceVersion`,
    );
  }

  const operations: JsonPatchOperation[] = [
    {
      op: "test",
      path: "/metadata/resourceVersion",
      value: resourceVersion,
    },
  ];

  if (!annotations) {
    operations.push({ op: "add", path: "/metadata/annotations", value: {} });
  }

  if (markCleanupComplete) {
    operations.push({
      op: "add",
      path: annotationPath(SSA_CLEANUP_ANNOTATION),
      value: "true",
    });
  }

  operations.push({
    op: "add",
    path: annotationPath(POD_RELOAD_CHECKSUM_ANNOTATION),
    value: checksum,
  });

  if (annotations?.[POD_RELOAD_PENDING_ANNOTATION]) {
    operations.push({
      op: "remove",
      path: annotationPath(POD_RELOAD_PENDING_ANNOTATION),
    });
  }

  const resourceKind = resourceType === "Secret" ? kind.Secret : kind.ConfigMap;
  await K8s(resourceKind, { name, namespace }).Patch(operations);
}

export function markPodReloadCreation(request: {
  SetAnnotation: (key: string, value: string) => unknown;
}) {
  request.SetAnnotation(POD_RELOAD_PENDING_ANNOTATION, "true");
}

async function runStartupCleanup(
  namespace: string,
  name: string,
  resourceType: ResourceType,
  discoverResourceConsumers: (namespace: string, name: string) => Promise<kind.Pod[]>,
) {
  const cleanup = startupCleanupQueue.then(async () => {
    const pods = await discoverResourceConsumers(namespace, name);
    await cleanupOverClaimedControllerFields(namespace, pods, log);
  });

  startupCleanupQueue = cleanup.catch(err => {
    log.warn(
      { resource: name, namespace, type: resourceType, err },
      "Field manager cleanup failed",
    );
  });

  await cleanup;
}

/**
 * Generic function to handle resource updates (Secret or ConfigMap)
 *
 * @param resource The Kubernetes resource that was updated
 * @param discoverResourceConsumers Function to discover pods using this resource
 * @param resourceType Type of resource ("Secret" or "ConfigMap")
 */
export async function handleResourceUpdate(
  resource: kind.Secret | kind.ConfigMap,
  discoverResourceConsumers: (namespace: string, name: string) => Promise<kind.Pod[]>,
  resourceType: ResourceType,
) {
  if (!resource.metadata?.name || !resource.metadata?.namespace) {
    return;
  }

  const { name, namespace } = resource.metadata;
  const annotations = resource.metadata.annotations || {};
  const currentChecksum = computeResourceChecksum(resource.data || {});
  const previousChecksum = annotations[POD_RELOAD_CHECKSUM_ANNOTATION];
  const creationPending = Boolean(annotations[POD_RELOAD_PENDING_ANNOTATION]);
  const cleanupComplete = Boolean(annotations[SSA_CLEANUP_ANNOTATION]);

  if (previousChecksum === currentChecksum) {
    return;
  }

  // Resources created while admission is active carry the pending annotation. An unprocessed
  // resource without it came from the watcher's initial list and should be baselined, not reloaded.
  if (!previousChecksum && !creationPending) {
    if (!cleanupComplete) {
      await runStartupCleanup(namespace, name, resourceType, discoverResourceConsumers);
    }
    try {
      await saveResourceState(resource, resourceType, currentChecksum, !cleanupComplete);
    } catch (error) {
      log.warn(
        { resource: name, namespace, type: resourceType, error },
        "Failed to initialize pod reload checksum",
      );
      throw error;
    }
    return;
  }

  if (!cleanupComplete) {
    await runStartupCleanup(namespace, name, resourceType, discoverResourceConsumers);
  }

  log.info(
    { resource: name, namespace, type: resourceType },
    `${resourceType} data ${previousChecksum ? "changed" : "created"}, processing pod reload`,
  );

  let podsToReload: kind.Pod[] = [];
  const selectorStr = annotations["uds.dev/pod-reload-selector"];

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
      throw error;
    }
  } else {
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
      throw error;
    }
  }

  if (podsToReload.length === 0) {
    log.warn(
      { resource: name, namespace, type: resourceType },
      `No pods found to reload for ${resourceType.toLowerCase()} change`,
    );
  } else {
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
      throw error;
    }
  }

  try {
    await saveResourceState(resource, resourceType, currentChecksum, !cleanupComplete);
  } catch (error) {
    log.warn(
      { resource: name, namespace, type: resourceType, error },
      "Failed to save pod reload state",
    );
    throw error;
  }
}

/**
 * Handles a secret update event
 *
 * @param secret The Kubernetes secret that was updated
 */
export async function handleSecretUpdate(secret: kind.Secret) {
  await handleResourceUpdate(secret, discoverSecretConsumers, "Secret");
}

/**
 * Handles a ConfigMap update event
 *
 * @param configMap The Kubernetes ConfigMap that was updated
 */
export async function handleConfigMapUpdate(configMap: kind.ConfigMap) {
  await handleResourceUpdate(configMap, discoverConfigMapConsumers, "ConfigMap");
}
