/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { UDSPackage } from "../../crd";
import { UDSConfig } from "../config/config";
import { getOwnerRef, purgeOrphans } from "../utils";
import { Component, setupLogger } from "../../../logger";

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

  // Always create ConfigMap - if no cert sources are available, create with empty content
  try {
    log.debug(`Reconciling CA Bundle ConfigMap for ${pkgName}`);

    // Build the CA bundle content by combining available certs
    const caBundleContent = buildCABundleContent();

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
    await K8s(kind.ConfigMap).Apply(configMapManifest);

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
 * Builds the combined CA bundle content from all configured certificate sources.
 * Combines user-provided certificates, DoD certificates, and public certificates
 * based on the current UDS configuration settings.
 *
 * @returns The combined PEM-formatted certificate bundle as a string.
 *          Returns empty string if no certificate sources are configured.
 */
function buildCABundleContent(): string {
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
 * Updates all existing CA Bundle ConfigMaps across the cluster with the latest certificate data.
 * This function is typically called when the global UDS configuration changes (e.g., when
 * certificates are rotated or configuration is updated). It finds all ConfigMaps labeled as
 * CA bundles and updates their certificate content with the current UDS configuration.
 *
 * @throws Error if the global ConfigMap update operation fails
 */
export async function updateAllCaBundleConfigMaps(): Promise<void> {
  try {
    log.debug("Starting global CA bundle ConfigMap update");

    // Build the updated CA bundle content (will be empty string if no certs)
    const updatedCaBundleContent = buildCABundleContent();

    // Get all CA bundle ConfigMaps across all namespaces
    const caBundleConfigMaps = await K8s(kind.ConfigMap)
      .WithLabel(CA_BUNDLE_CONFIGMAP_LABEL, "true")
      .Get();

    if (!caBundleConfigMaps.items || caBundleConfigMaps.items.length === 0) {
      log.debug("No existing CA bundle ConfigMaps found to update");
      return;
    }

    // Update each ConfigMap with the new CA bundle content
    for (const configMap of caBundleConfigMaps.items) {
      if (!configMap.metadata?.name || !configMap.metadata?.namespace) {
        // This should not happen, but needed for type safety
        continue;
      }

      const configMapName = configMap.metadata.name;
      const namespace = configMap.metadata.namespace;

      log.debug(`Updating CA bundle ConfigMap ${configMapName} in namespace ${namespace}`);

      // Find the first key for the CA bundle data
      const dataKeys = Object.keys(configMap.data || {});
      const caBundleKey = dataKeys[0];

      if (!caBundleKey) {
        log.warn(`No suitable key found in ConfigMap ${configMapName}, skipping update`);
        continue;
      }

      // Update the ConfigMap data, removing managedFields to avoid conflicts
      const updatedConfigMap = {
        ...configMap,
        metadata: {
          ...configMap.metadata,
          managedFields: undefined,
        },
        data: {
          [caBundleKey]: updatedCaBundleContent,
        },
      };

      await K8s(kind.ConfigMap).Apply(updatedConfigMap);
    }
  } catch (err) {
    throw new Error(
      `Failed to update CA bundle ConfigMaps globally, cause: ${JSON.stringify(err)}`,
    );
  }
}
