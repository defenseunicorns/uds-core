/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { GenericClass, GenericKind } from "kubernetes-fluent-client";
import { K8s } from "pepr";
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
 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
 */
export async function purgeOrphans<T extends GenericClass>(
  generation: string,
  namespace: string,
  pkgName: string,
  kind: T,
  log: Logger,
) {
  const resources = await K8s(kind).InNamespace(namespace).WithLabel("uds/package", pkgName).Get();

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
