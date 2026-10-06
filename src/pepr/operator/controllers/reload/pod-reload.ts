/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { createHash } from "crypto";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { retryWithDelay } from "../utils";
import {
  cleanupOverClaimedControllerFields,
  reloadPods,
  resolveControllerKindAndName,
} from "./reload-utils";

const log = setupLogger(Component.OPERATOR_SECRETS);

// Define resource types
export type ResourceType = "Secret" | "ConfigMap";

interface ReloadState {
  checksum: string;
  status: "creating" | "creationAndUpdatePending" | "updating" | "complete";
}

// Maps to store resource checksums and states for change detection
// Exported for testing purposes
export const secretReloadStateCache = new Map<string, ReloadState>();
export const configMapReloadStateCache = new Map<string, ReloadState>();

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

// Kubernetes watch and list responses use timestamp strings despite Date types.
function timestampMs(value: Date | string | undefined): number | undefined {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value ?? "");
  return Number.isFinite(ms) ? ms : undefined;
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

    const usesSecretVolume = pod.spec.volumes?.some(
      volume => volume.secret && volume.secret.secretName === secretName,
    );
    if (usesSecretVolume) return true;

    const usesProjectedSecretVolume = pod.spec.volumes?.some(volume =>
      volume.projected?.sources?.some(source => source.secret?.name === secretName),
    );
    if (usesProjectedSecretVolume) return true;

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
 * @param stateCache The cache to use for this resource type
 * @param discoverResourceConsumers Function to discover pods using this resource
 * @param resourceType Type of resource ("Secret" or "ConfigMap")
 */
export async function handleResourceUpdate(
  resource: kind.Secret | kind.ConfigMap,
  stateCache: Map<string, ReloadState>,
  discoverResourceConsumers: (namespace: string, name: string) => Promise<kind.Pod[]>,
  resourceType: ResourceType,
) {
  if (!resource.metadata?.name || !resource.metadata?.namespace) {
    return;
  }

  const { name, namespace } = resource.metadata;
  // Kubernetes UIDs distinguish a new resource from a late event for a deleted one.
  const cacheKey = `${namespace}/${name}${resource.metadata.uid ? `/${resource.metadata.uid}` : ""}`;

  const data = resource.data || {};

  const currentChecksum = computeResourceChecksum(data);

  const state = stateCache.get(cacheKey);
  const isCreation =
    !state || state.status === "creating" || state.status === "creationAndUpdatePending";
  const changedDuringCreation =
    state?.status === "creationAndUpdatePending" ||
    (state?.status === "creating" && state.checksum !== currentChecksum);

  if (state?.checksum === currentChecksum && state.status === "complete") {
    return;
  }

  function checkpoint(status: ReloadState["status"]) {
    stateCache.set(cacheKey, { checksum: currentChecksum, status });
  }

  try {
    const podsToReload: kind.Pod[] = [];

    // Proactively clean up any over-claimed controller fields on first appearance
    // so Helm upgrades don't conflict before the first reload fires.
    if (isCreation) {
      // Has not been cleaned up by a prior run.
      if (!resource.metadata?.annotations?.[SSA_CLEANUP_ANNOTATION]) {
        // Chain onto the queue so concurrent first-observation events on startup
        // run sequentially rather than fanning out parallel API calls.
        startupCleanupQueue = startupCleanupQueue
          .then(async () => {
            const pods = await discoverResourceConsumers(namespace, name);
            await cleanupOverClaimedControllerFields(namespace, pods, log);
            // Mark complete so future restarts skip this work entirely.
            try {
              const kindClass = resourceType === "Secret" ? kind.Secret : kind.ConfigMap;
              const annotationPath = `/metadata/annotations/${SSA_CLEANUP_ANNOTATION.replace(/~/g, "~0").replace(/\//g, "~1")}`;
              const ops: { op: "add"; path: string; value: unknown }[] = [];
              if (!resource.metadata?.annotations) {
                ops.push({ op: "add", path: "/metadata/annotations", value: {} });
              }
              ops.push({ op: "add", path: annotationPath, value: "true" });
              await K8s(kindClass, { name, namespace }).Patch(ops);
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
      }

      // evaluate if resource is new and pods should be reloaded
      await startupCleanupQueue;
      checkpoint(changedDuringCreation ? "creationAndUpdatePending" : "creating");
      const resourceTimestamp = resource.metadata?.creationTimestamp;
      const resourceCreatedAt = timestampMs(resourceTimestamp);
      if (resourceTimestamp !== undefined && resourceCreatedAt === undefined) {
        throw new Error(`Invalid creation timestamp for ${resourceType} ${namespace}/${name}`);
      }
      const pods = await discoverResourceConsumers(namespace, name);
      const candidates = pods.filter(pod => {
        const usesOptionalMount =
          pod.spec?.volumes?.some(volume => {
            if (resourceType === "Secret") {
              return (
                (volume.secret?.secretName === name && volume.secret?.optional === true) ||
                (volume.projected?.sources?.some(
                  source => source.secret?.name === name && source.secret?.optional === true,
                ) ??
                  false)
              );
            }

            return (
              (volume.configMap?.name === name && volume.configMap?.optional === true) ||
              (volume.projected?.sources?.some(
                source => source.configMap?.name === name && source.configMap?.optional === true,
              ) ??
                false)
            );
          }) ?? false;

        const startedAt = timestampMs(pod.status?.startTime);

        return (
          usesOptionalMount &&
          startedAt !== undefined &&
          resourceCreatedAt !== undefined &&
          startedAt <= resourceCreatedAt &&
          !pod.metadata?.deletionTimestamp &&
          pod.status?.phase !== "Succeeded" &&
          pod.status?.phase !== "Failed"
        );
      });

      log.info(
        { resource: name, namespace, type: resourceType },
        `${resourceType} data created, processing pod reload`,
      );

      for (const pod of candidates) {
        const owner = pod.metadata?.ownerReferences?.find(ref => ref.controller === true);

        if (!owner) {
          // Standalone pod: there is no controller template to inspect.
          podsToReload.push(pod);
          continue;
        }

        // Resolve the owner (including ReplicaSet → Deployment), then fetch it.
        const resolved = await resolveControllerKindAndName(namespace, owner, log);
        if (!resolved) {
          podsToReload.push(pod);
          continue;
        }
        const controller = await K8s(resolved.kindClass).InNamespace(namespace).Get(resolved.name);
        const restartedAt =
          controller?.spec?.template?.metadata?.annotations?.["uds.dev/restartedAt"];

        // Same-second timestamps cannot establish whether the restart preceded creation.
        if (
          !state &&
          resourceCreatedAt !== undefined &&
          restartedAt &&
          Math.floor(Date.parse(restartedAt) / 1000) > Math.floor(resourceCreatedAt / 1000)
        ) {
          continue; // A restart has already been requested since creation.
        }

        podsToReload.push(pod);
      }

      if (!changedDuringCreation) {
        if (podsToReload.length > 0) {
          await reloadPods(
            namespace,
            podsToReload,
            `${resourceType} ${name} change`,
            log,
            `${resourceType}Changed`,
          );
        }
        checkpoint("complete");
        return;
      }
    }

    // Keep creation pending until both the optional mounts and the data change are handled.
    if (!changedDuringCreation) checkpoint("updating");

    log.info(
      { resource: name, namespace, type: resourceType },
      `${resourceType} data changed, processing pod reload`,
    );

    // Check if we have an explicit pod selector in annotations
    const selectorStr = resource.metadata?.annotations?.["uds.dev/pod-reload-selector"];

    let updatePods: kind.Pod[];
    if (selectorStr) {
      const selector = parseSelectorString(selectorStr);
      if (!selector) {
        const errorMsg = `Invalid selector format in uds.dev/pod-reload-selector annotation for ${resourceType.toLowerCase()} ${namespace}/${name}: ${selectorStr}. Expected format: key1=value1,key2=value2`;
        log.error(
          { resource: name, namespace, selector: selectorStr, type: resourceType },
          errorMsg,
        );
        throw new Error(errorMsg);
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

      async function getPodsWithSelector() {
        return podQuery.Get();
      }
      const pods = await retryWithDelay(getPodsWithSelector, log);
      updatePods = pods.items;
    } else {
      // No explicit selector, use auto-discovery
      log.debug(
        { resource: name, namespace, type: resourceType },
        `Auto-discovering ${resourceType.toLowerCase()} consumers`,
      );
      async function getPodsUsingResource() {
        return discoverResourceConsumers(namespace, name);
      }
      updatePods = await retryWithDelay(getPodsUsingResource, log);
    }

    // A changed resource can have old optional-mount pods and newer update consumers.
    // Restart each pod once, even when both selections contain it.
    const podIds = new Set(podsToReload.map(pod => pod.metadata?.uid ?? pod.metadata?.name));
    for (const pod of updatePods) {
      const id = pod.metadata?.uid ?? pod.metadata?.name;
      if (!podIds.has(id)) {
        podsToReload.push(pod);
        podIds.add(id);
      }
    }

    // If no pods found, log and exit
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
      await reloadPods(
        namespace,
        podsToReload,
        `${resourceType} ${name} change`,
        log,
        `${resourceType}Changed`,
      );
    }
    checkpoint("complete");
  } catch (error) {
    log.error(
      { resource: name, namespace, error, type: resourceType },
      `Failed to process ${resourceType.toLowerCase()} pod reload`,
    );
    throw error;
  }
}

/**
 * Generic function to handle resource deletion (Secret or ConfigMap)
 *
 * @param resource The Kubernetes resource that was deleted
 * @param stateCache The cache to use for this resource type
 */
export function handleResourceDelete(
  resource: kind.Secret | kind.ConfigMap,
  stateCache: Map<string, ReloadState>,
) {
  if (!resource.metadata?.name || !resource.metadata?.namespace) {
    return;
  }

  const { name, namespace } = resource.metadata;
  const cacheKey = `${namespace}/${name}${resource.metadata.uid ? `/${resource.metadata.uid}` : ""}`;

  // Clean up the cache entry
  stateCache.delete(cacheKey);
}

/**
 * Handles a secret update event
 *
 * @param secret The Kubernetes secret that was updated
 */
export async function handleSecretUpdate(secret: kind.Secret) {
  await handleResourceUpdate(secret, secretReloadStateCache, discoverSecretConsumers, "Secret");
}

/**
 * Handles a secret deletion event
 *
 * @param secret The Kubernetes secret that was deleted
 */
export function handleSecretDelete(secret: kind.Secret) {
  handleResourceDelete(secret, secretReloadStateCache);
}

/**
 * Handles a ConfigMap update event
 *
 * @param configMap The Kubernetes ConfigMap that was updated
 */
export async function handleConfigMapUpdate(configMap: kind.ConfigMap) {
  await handleResourceUpdate(
    configMap,
    configMapReloadStateCache,
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
  handleResourceDelete(configMap, configMapReloadStateCache);
}
