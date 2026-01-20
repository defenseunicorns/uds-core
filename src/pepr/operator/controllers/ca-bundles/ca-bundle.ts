/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";
import { UDSConfig } from "../config/config";
import { reloadPods } from "../reload/reload-utils";
import { getOwnerRef, purgeOrphans } from "../utils";

export const CA_BUNDLE_CONFIGMAP_LABEL = "uds/ca-bundle"; // Label to identify CA bundle ConfigMaps
const DEFAULT_CONFIGMAP_NAME = "uds-trust-bundle";
const DEFAULT_CONFIGMAP_KEY = "ca-bundle.pem";

const log = setupLogger(Component.OPERATOR_CA_BUNDLE);

/**
 * Creates or updates a CA Bundle ConfigMap for the given UDS Package in the specified namespace.
 * The ConfigMap contains the combined CA bundle from user-provided, DoD, and public certificates
 * as configured in the global UDS configuration.
 *
 * @param pkg The UDS Package CR that defines the ConfigMap configuration
 * @param namespace The target namespace where the ConfigMap will be created
 * @throws Error if ConfigMap creation or orphan cleanup fails
 */
export async function caBundleConfigMap(pkg: UDSPackage, namespace: string): Promise<void> {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  // Set Defaults
  const configMapName = pkg.spec?.caBundle?.configMap?.name || DEFAULT_CONFIGMAP_NAME;
  const configMapKey = pkg.spec?.caBundle?.configMap?.key || DEFAULT_CONFIGMAP_KEY;
  const configMapLabels = pkg.spec?.caBundle?.configMap?.labels || {};
  const configMapAnnotations = pkg.spec?.caBundle?.configMap?.annotations || {};

  try {
    log.debug(`Reconciling CA Bundle ConfigMap for ${pkgName}`);

    // Build the CA bundle content by combining available certs
    const caBundleContent = buildCABundleContent();

    // If no CA bundle content, delete any existing ConfigMaps instead of creating empty ones
    if (!caBundleContent || caBundleContent.trim() === "") {
      log.debug(`No CA bundle content available, deleting any existing ConfigMaps for ${pkgName}`);

      // Delete any existing ConfigMaps for this package
      try {
        await K8s(kind.ConfigMap)
          .InNamespace(namespace)
          .WithLabel("uds/package", pkgName)
          .WithLabel(CA_BUNDLE_CONFIGMAP_LABEL, "true")
          .Delete();
        log.debug(`Deleted existing CA bundle ConfigMaps for ${pkgName} in namespace ${namespace}`);
      } catch {
        // Don't fail if deletion fails (ConfigMap might not exist)
      }

      return;
    }

    // Create ConfigMap with CA bundle content
    const configMapManifest: kind.ConfigMap = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: configMapName,
        namespace: namespace,
        labels: {
          "uds/package": pkgName,
          "uds/generation": generation,
          [CA_BUNDLE_CONFIGMAP_LABEL]: "true",
          ...configMapLabels,
        },
        annotations: {
          ...configMapAnnotations,
        },
        // Set owner reference to the UDS Package for proper cleanup
        ownerReferences: ownerRefs,
      },
      data: {
        [configMapKey]: caBundleContent,
      },
    };

    // Apply the ConfigMap
    await K8s(kind.ConfigMap).Apply(configMapManifest, { force: true });

    // Purge any orphaned ConfigMaps from previous generations
    await purgeOrphans(generation, namespace, pkgName, kind.ConfigMap, log, {
      [CA_BUNDLE_CONFIGMAP_LABEL]: "true",
    });
  } catch (err) {
    throw new Error(
      `Failed to process CA Bundle ConfigMap for ${pkgName}, cause: ${JSON.stringify(err)}`,
    );
  }
}

/**
 * Updates the Istio uds-trust-bundle ConfigMap with the combined CA bundle.
 * Istio expects its root CA in the `extra.pem` key of this ConfigMap.
 * This ConfigMap is managed entirely by the operator.
 */
export async function updateIstioCASecret(skipReload = false): Promise<void> {
  const namespace = "istio-system";
  const configMapName = "uds-trust-bundle";

  try {
    // Build the combined CA bundle content
    const caBundleContent = buildCABundleContent();

    // Directly apply the ConfigMap (handles create and update)
    const configMap: kind.ConfigMap = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: configMapName,
        namespace,
      },
      data: {
        "extra.pem": caBundleContent || "",
      },
    };

    await K8s(kind.ConfigMap).Apply(configMap, { force: true });
    log.debug(
      `Updated ${configMapName} ConfigMap in ${namespace} namespace with combined CA bundle`,
    );

    // Skip reload if requested (e.g., during initial load or batch updates)
    if (skipReload) {
      log.debug(`Skipping Istiod reload for ${configMapName} update`);
      return;
    }

    // Reload Istiod to ensure it picks up the trust bundle change
    try {
      const istioPods = await K8s(kind.Pod).InNamespace(namespace).WithLabel("app", "istiod").Get();
      await reloadPods(namespace, istioPods.items, "CA bundle update", log, "CA_BUNDLE");
    } catch (err) {
      log.error(`Failed to reload Istiod pods in namespace ${namespace}`, err);
    }
  } catch (err) {
    throw new Error(
      `Failed to update ${configMapName} ConfigMap in ${namespace}: ${JSON.stringify(err)}`,
    );
  }
}

/**
 * Builds the combined CA bundle content from all configured certificate sources.
 * Combines user-provided certificates, DoD certificates, and public certificates
 * based on the current UDS configuration settings.
 *
 * @returns The combined PEM-formatted certificate bundle as a string.
 *          Returns empty string if no certificate sources are configured.
 */
export function buildCABundleContent(): string {
  const certs: string[] = [];

  // Add user-provided certs (base64 encoded)
  if (UDSConfig.caBundle.certs) {
    const userCerts = atob(UDSConfig.caBundle.certs);
    if (userCerts) {
      certs.push(userCerts);
    }
  }

  // Add DoD certs if included
  if (UDSConfig.caBundle.includeDoDCerts && UDSConfig.caBundle.dodCerts) {
    const dodCerts = atob(UDSConfig.caBundle.dodCerts);
    if (dodCerts) {
      certs.push(dodCerts);
    }
  }

  // Add public certs if included
  if (UDSConfig.caBundle.includePublicCerts && UDSConfig.caBundle.publicCerts) {
    const publicCerts = atob(UDSConfig.caBundle.publicCerts);
    if (publicCerts) {
      certs.push(publicCerts);
    }
  }

  // Join all certs with newlines, ensuring proper PEM format
  return certs
    .filter(cert => cert.trim())
    .join("\n\n")
    .trim();
}

/**
 * Updates CA bundle ConfigMaps for all UDS packages in the cluster with the latest certificate data.
 * This function is typically called when the global UDS configuration changes (e.g., when
 * certificates are rotated or configuration is updated). It lists all UDS packages and calls
 * caBundleConfigMap for each package to ensure their CA bundle ConfigMaps are up to date.
 *
 * @throws Error if the package listing or ConfigMap update operations fail
 */
export async function updateAllCaBundleConfigMaps(skipReload = false): Promise<void> {
  try {
    log.debug("Starting CA bundle ConfigMap updates for all UDS packages");

    // Get all UDS packages across all namespaces
    const packages = await K8s(UDSPackage).Get();

    // Process each package and update/delete its CA bundle ConfigMap as needed
    const packageUpdates = (packages.items || []).map(async pkg => {
      if (!pkg.metadata?.name || !pkg.metadata?.namespace) {
        return;
      }
      try {
        await caBundleConfigMap(pkg, pkg.metadata.namespace);
      } catch (err) {
        log.error(
          `Failed to process CA bundle ConfigMap for package ${pkg.metadata.name} in namespace ${pkg.metadata.namespace}`,
          err,
        );
        throw err;
      }
    });

    const results = await Promise.allSettled([...packageUpdates, updateIstioCASecret(skipReload)]);

    // Check for any failures
    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      log.warn(`Completed CA bundle updates with ${failures.length} failures`);
    } else {
      log.debug("Completed CA bundle ConfigMap updates for all UDS packages");
    }
  } catch (err) {
    log.error("Failed to update CA bundle ConfigMaps for all packages", err);
    throw new Error("Failed to update CA bundle ConfigMaps for all packages", { cause: err });
  }
}
