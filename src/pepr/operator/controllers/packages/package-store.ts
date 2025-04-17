/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

/**
 * A collection of functions related to watching UDSPackages
 * Manages an in-memory map of UDSPackage resources
 * Used in Pepr Validating Webhook Pods when vetting UDS Package resources for admission
 */
import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";
const log = setupLogger(Component.OPERATOR_PACKAGES);

// Map structure: namespace -> (package name -> package)
export type PackageNamespaceMap = Map<string, Map<string, UDSPackage>>;
let packageNamespaceMap: PackageNamespaceMap;

/**
 * Initializes the package namespace map.
 *
 * This function creates a new `Map` object and assigns it to the `packageNamespaceMap` variable.
 * The `packageNamespaceMap` is used to store packages, using their namespace as the key.
 */
function init(): void {
  packageNamespaceMap = new Map();
}

/**
 * Adds a package to the package namespace map.
 *
 * @param {UDSPackage} pkg - The package to be added. It should contain metadata with a namespace and name.
 * @param {boolean} [logger=true] - Optional flag to enable logging. Defaults to true.
 *
 * This function retrieves the namespace and name from the package metadata and adds the package
 * to the packageNamespaceMap. If the namespace doesn't exist, it creates a new map for that namespace.
 * The function then adds or updates the package in the namespace map using the package name as the key.
 */
function add(pkg: UDSPackage, logger: boolean = true): void {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }
  const namespace = pkg.metadata.namespace;
  const name = pkg.metadata.name;

  // Get or create the namespace map
  if (!packageNamespaceMap.has(namespace)) {
    packageNamespaceMap.set(namespace, new Map());
  }

  const namespaceMap = packageNamespaceMap.get(namespace)!;
  const isUpdate = namespaceMap.has(name);

  // Set the package
  namespaceMap.set(name, pkg);

  if (logger) {
    if (isUpdate) {
      log.debug(`Updating PackageStore for package ${name} in namespace ${namespace}.`);
    } else {
      log.debug(`Added package: ${namespace}/${name} to package map`);
    }
  }
}

/**
 * Removes a package from the package namespace map.
 *
 * @param {UDSPackage} pkg - The package to be removed. It should contain metadata with a namespace and name.
 * @param {boolean} [logger=true] - Optional flag to enable logging. Defaults to true.
 *
 * This function retrieves the namespace and name from the package metadata and removes the package
 * from the packageNamespaceMap. If the namespace map becomes empty after removal, the namespace
 * is also removed from the packageNamespaceMap.
 */
function remove(pkg: UDSPackage, logger: boolean = true): void {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const namespace = pkg.metadata.namespace;
  const name = pkg.metadata.name;

  const namespaceMap = packageNamespaceMap.get(namespace);
  if (!namespaceMap) {
    // Namespace doesn't exist, nothing to remove
    return;
  }

  // Remove the package
  namespaceMap.delete(name);

  // If namespace map is empty, remove the namespace
  if (namespaceMap.size === 0) {
    packageNamespaceMap.delete(namespace);
  }

  if (logger) {
    log.debug(`Removed package: ${namespace}/${name} from package map`);
  }
}

/**
 * Checks if a given namespace exists within the package namespace map.
 *
 * This function determines whether a namespace has been previously registered
 * in the `packageNamespaceMap`.  It provides a way to verify the existence
 * of a package in a given namespace.
 *
 * @param namespace The namespace to check for existence.
 * @returns `true` if the namespace exists in the map; otherwise, `false`.
 */
function hasKey(namespace: string): boolean {
  return packageNamespaceMap.has(namespace);
}

/**
 * Retrieves the package name associated with a given namespace.
 *
 * This function looks up the namespace in the `packageNamespaceMap` and, if found,
 * returns the name of the first package in that namespace.
 * If the namespace is not found or there are no packages, it returns null.
 *
 * @param namespace The namespace to look up in the `packageNamespaceMap`.
 * @returns The package name associated with the namespace, or null if not found.
 */
function getPkgName(namespace: string): string | null {
  const namespaceMap = packageNamespaceMap.get(namespace);
  if (!namespaceMap || namespaceMap.size === 0) {
    return null;
  }

  // Return the name of the first package in the namespace
  return Array.from(namespaceMap.keys())[0];
}

export const PackageStore = {
  init,
  add,
  hasKey,
  getPkgName,
  remove,
};
