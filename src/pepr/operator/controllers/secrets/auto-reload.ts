/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { createHash } from "crypto";
import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { rotatePods } from "../utils";

const log = setupLogger(Component.OPERATOR_SECRETS);

// Map to store secret checksums for change detection
// Exported for testing purposes
export const secretChecksumCache = new Map<string, string>();

/**
 * Computes a SHA256 checksum of the secret data
 *
 * @param data The secret data to compute the checksum for
 * @returns A hex-encoded SHA256 checksum
 */
export function computeSecretChecksum(data: Record<string, string>): string {
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
async function discoverSecretConsumers(namespace: string, secretName: string) {
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
    const usesProjectedSecretVolume = pod.spec.volumes?.some(volume => {
      if (!volume.projected || !volume.projected.sources) return false;

      return volume.projected.sources.some(
        source => source.secret && source.secret.name === secretName,
      );
    });
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
    // Handle key=value format (like "app=neuvector-controller-pod")
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
 * Handles a secret update event
 *
 * @param secret The Kubernetes secret that was updated
 */
export async function handleSecretUpdate(secret: kind.Secret) {
  if (!secret.metadata?.name || !secret.metadata?.namespace || !secret.data) {
    return;
  }

  const { name, namespace } = secret.metadata;
  const cacheKey = `${namespace}/${name}`;

  // Compute checksum of the current secret data
  const currentChecksum = computeSecretChecksum(secret.data);

  // Check if we've seen this secret before
  const previousChecksum = secretChecksumCache.get(cacheKey);

  // Update the cache regardless of whether we process this update
  secretChecksumCache.set(cacheKey, currentChecksum);

  // If this is the first time we're seeing this secret, or if the data hasn't changed, exit early
  if (!previousChecksum || previousChecksum === currentChecksum) {
    return;
  }

  log.info({ secret: name, namespace }, "Secret data changed, processing pod rotation");

  // Determine which pods to rotate based on the strategy
  let podsToRotate: kind.Pod[] = [];

  // Check if we have an explicit pod selector in annotations
  const selectorStr = secret.metadata?.annotations?.["uds.dev/pod-selector"];

  if (selectorStr) {
    const selector = parseSelectorString(selectorStr);
    if (!selector) {
      const errorMsg = `Invalid selector format in uds.dev/pod-selector annotation for secret ${namespace}/${name}: ${selectorStr}. Expected format: key1=value1,key2=value2`;
      log.error({ secret: name, namespace, selector: selectorStr }, errorMsg);
      return;
    }

    log.debug(
      { secret: name, namespace, selector },
      "Using explicit pod selector from secret label for rotation",
    );

    // Build query with each label
    let podQuery = K8s(kind.Pod).InNamespace(namespace);
    for (const [key, value] of Object.entries(selector)) {
      podQuery = podQuery.WithLabel(key, value);
    }

    const pods = await podQuery.Get();
    podsToRotate = pods.items;
  } else {
    // No explicit selector, use auto-discovery
    log.debug(
      { secret: name, namespace },
      "No explicit selector found, auto-discovering secret consumers",
    );
    podsToRotate = await discoverSecretConsumers(namespace, name);
  }

  // If no pods found, log and exit
  if (podsToRotate.length === 0) {
    log.warn({ secret: name, namespace }, "No pods found to rotate for secret change");
    return;
  }

  // Rotate the pods
  log.info(
    { secret: name, namespace, podCount: podsToRotate.length },
    `Rotating ${podsToRotate.length} pods due to secret change`,
  );

  await rotatePods(namespace, podsToRotate, `Secret ${name} change`, log);
}

/**
 * Handles a secret deletion event
 *
 * @param secret The Kubernetes secret that was deleted
 */
export function handleSecretDelete(secret: kind.Secret) {
  if (!secret.metadata?.name || !secret.metadata?.namespace) {
    return;
  }

  const { name, namespace } = secret.metadata;
  const cacheKey = `${namespace}/${name}`;

  // Clean up the cache entry
  secretChecksumCache.delete(cacheKey);
}
