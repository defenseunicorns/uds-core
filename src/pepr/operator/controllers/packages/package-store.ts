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

export type PackageNamespaceMap = Map<string, UDSPackage[]>;
let packageNamespaceMap: PackageNamespaceMap

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
 * @param {UDSPackage} pkg - The package to be added. It should contain metadata with a namespace.
 * @param {boolean} [logger=true] - Optional flag to enable logging. Defaults to true.
 *
 * This function retrieves the namespace from the package metadata and adds the package
 * to the packageNamespaceMap. If the namespace is not present, it defaults to an empty string.
 * For backwards compatibility, the function checks if the namespace has an existing package. If it does,
 * the package to be added is appended to the existing list of Packages. If not, a new key is created
 * in packageNamespaceMap for that namespace, containing a list of one element.
 */
function add(pkg: UDSPackage, logger: boolean = true): void {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }
  const namespace = pkg.metadata?.namespace;
  // Get existing packages if any and merge into the one being added
  const existingValue = packageNamespaceMap.get(namespace);
  if (existingValue) {
    existingValue.push(pkg);
  } else {
    packageNamespaceMap.set(namespace, [pkg]);
  }

  if (logger) {
    log.debug(`Added package: ${namespace}/${pkg.metadata?.name} to package map`);
  }
}

/**
 * Removes a package from the package namespace map.
 *
 * @param {UDSPackage} pkg - The package to be removed. It should contain metadata with a namespace.
 * @param {boolean} [logger=true] - Optional flag to enable logging. Defaults to true.
 *
 * This function retrieves the namespace from the package metadata and deletes it from the
 * packageNamespaceMap. If the namespace is not present, it defaults to an empty string.
 * For backwards compatibility, we check if the namespace has more than one package.
 * If that is the case, we update the value for that namespace in packageNamespaceMap.
 * Otherwise, if there is only one package in the namespace, we delete the key.
 *
 */
function remove(pkg: UDSPackage, logger: boolean = true): void {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }
  
  const namespace = pkg.metadata?.namespace;
  const pkgToRemove = pkg.metadata?.name;
  const items = packageNamespaceMap.get(namespace) || [];

  const updatedItems = items.filter(pkg => pkg.metadata?.name !== pkgToRemove);
  if (updatedItems.length > 0) {
    packageNamespaceMap.set(namespace, updatedItems);
  } else {
    packageNamespaceMap.delete(namespace);
  }
  if (logger) {
    log.debug(`Removed package: ${namespace}/${pkg.metadata?.name} from package map`);
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
 * returns the `name` property from the `metadata` of the associated package.
 * If the namespace is not found or the metadata or name is missing, it returns null.
 *
 * @param namespace The namespace to look up in the `packageNamespaceMap`.
 * @returns The package name associated with the namespace, or null if not found.
 *
 * @example
 * Assuming packageNamespaceMap contains { 'my-namespace': [{ metadata: { name: 'my-package' } }], [{ metadata: { name: 'other-package' } }]}
 * const packageName = getPkgName('my-namespace'); // Returns 'my-package'
 *
 * @example
 * Assuming packageNamespaceMap does not contain 'unknown-namespace'
 * const packageName = getPkgName('unknown-namespace'); // Returns null
 */
function getPkgName(namespace: string): string | null {
  const items = packageNamespaceMap.get(namespace) || [];
  if (items.length > 0) {
    // Always return the first package found
    const foundPkg = items[0];
    return foundPkg.metadata?.name || null;
  } else {
    return null;
  }
}

export const PackageStore = {
  init,
  add,
  hasKey,
  getPkgName,
  remove,
};
