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

export type PackageNamespaceMap = Map<string, UDSPackage>;
const packageNamespaceMap: PackageNamespaceMap = new Map();

/**
 * Adds a package to the package namespace map.
 *
 * @param {UDSPackage} pkg - The package to be added. It should contain metadata with a namespace.
 * @param {boolean} [logger=true] - Optional flag to enable logging. Defaults to true.
 *
 * This function retrieves the namespace from the package metadata and adds the package
 * to the packageNamespaceMap. If the namespace is not present, it defaults to an empty string.
 */
function add(pkg: UDSPackage, logger: boolean = true) {
  const namespace = pkg.metadata?.namespace || "";
  packageNamespaceMap.set(namespace, pkg);
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
 */
function remove(pkg: UDSPackage, logger: boolean = true) {
  const namespace = pkg.metadata?.namespace || "";
  packageNamespaceMap.delete(namespace);
  if (logger) {
    log.debug(`Removed package: ${namespace}/${pkg.metadata?.name} from package map`);
  }
}

export const PackageStore = {
  add,
  remove,
  packageNamespaceMap,
};
