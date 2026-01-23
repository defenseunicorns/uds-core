/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";
import { UDSConfig } from "../config/config";
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
 * Updates the Istio trust bundle ConfigMap in the `istio-system` namespace.
 * This ConfigMap (`uds-trust-bundle`) contains the combined CA bundle (user-provided, DoD, and public certs).
 * Istio is configured to use this ConfigMap for its mesh-wide trust anchor via the `extra.pem` key.
 *
 * @param skipIstioReload - If true, skips restarting Istiod pods after updating the ConfigMap.
 *
 * @throws Error if the ConfigMap cannot be applied to the cluster.
 */
export async function updateIstioCAConfigMap(): Promise<void> {
  const namespace = "istio-system";
  const configMapName = "uds-trust-bundle";

  // Only manage infrastructure in watcher or dev mode
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    try {
      // Ensure the namespace exists
      await K8s(kind.Namespace).Apply({
        metadata: { name: namespace },
      });

      // Build the combined CA bundle content
      const caBundleContent = buildCABundleContent();

      // Directly apply the ConfigMap (handles create and update)
      const configMap: kind.ConfigMap = {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: {
          name: configMapName,
          namespace,
          labels: {
            "uds.dev/pod-reload": "true",
          },
        },
        data: {
          "extra.pem": caBundleContent || "",
        },
      };

      await K8s(kind.ConfigMap).Apply(configMap, { force: true });
      log.debug(
        `Updated ${configMapName} ConfigMap in ${namespace} namespace with combined CA bundle`,
      );
    } catch (err) {
      throw new Error(
        `Failed to update ${configMapName} ConfigMap in ${namespace}: ${JSON.stringify(err)}`,
      );
    }
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
 * Updates the CA bundle ConfigMap for all UDS packages and the Istio trust bundle.
 * This is a global synchronization operation that ensures all managed namespaces and the
 * Istio control plane are up-to-date with the latest certificate configuration from `UDSConfig`.
 *
 * @throws Error if the package listing or any update operation fails.
 */
export async function updateAllCaBundleConfigMaps(): Promise<void> {
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

    const results = await Promise.allSettled([...packageUpdates, updateIstioCAConfigMap()]);

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
