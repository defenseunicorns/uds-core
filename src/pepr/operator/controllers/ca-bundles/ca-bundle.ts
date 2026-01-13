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
 * Updates the Istio sso-ca-cert secret with the combined CA bundle.
 * This secret is used by Istio's JWKS fetcher for TLS verification.
 */
export async function updateIstioCASecret(): Promise<void> {
  const namespace = "istio-system";
  const secretName = "sso-ca-cert";

  try {
    // Build the combined CA bundle content
    const caBundleContent = buildCABundleContent();

    // If no CA bundle content, delete the secret data
    if (!caBundleContent || caBundleContent.trim() === "") {
      log.debug("No CA bundle content available, skipping sso-ca-cert secret update");
      return;
    }

    // Get existing secret
    const secret = await K8s(kind.Secret).InNamespace(namespace).Get(secretName);

    // Update secret data with combined bundle
    const updatedSecret = {
      ...secret,
      data: {
        "extra.pem": btoa(caBundleContent),
      },
    };

    // Apply the updated secret
    await K8s(kind.Secret).Apply(updatedSecret, { force: true });
    log.debug(`Updated ${secretName} secret in ${namespace} namespace with combined CA bundle`);
  } catch (err) {
    // If secret doesn't exist, that's okay - it will be created by the chart
    if (err?.status === 404) {
      log.debug(`Secret ${secretName} not found in ${namespace}, will be created by chart`);
      return;
    }
    throw new Error(
      `Failed to update ${secretName} secret in ${namespace}: ${JSON.stringify(err)}`,
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
export async function updateAllCaBundleConfigMaps(): Promise<void> {
  try {
    log.debug("Starting CA bundle ConfigMap updates for all UDS packages");

    // Get all UDS packages across all namespaces
    const packages = await K8s(UDSPackage).Get();

    if (!packages.items || packages.items.length === 0) {
      log.debug("No UDS packages found, no CA bundle ConfigMaps to update");
      return;
    }

    log.debug(`Found ${packages.items.length} UDS packages, processing CA bundle ConfigMaps`);

    // Process each package and update/delete its CA bundle ConfigMap as needed
    for (const pkg of packages.items) {
      if (!pkg.metadata?.name || !pkg.metadata?.namespace) {
        // This should not happen, but needed for type safety
        continue;
      }

      const pkgName = pkg.metadata.name;
      const namespace = pkg.metadata.namespace;

      try {
        log.debug(
          `Processing CA bundle ConfigMap for package ${pkgName} in namespace ${namespace}`,
        );
        await caBundleConfigMap(pkg, namespace);
      } catch (err) {
        // Log the error but continue processing other packages
        log.error(
          `Failed to process CA bundle ConfigMap for package ${pkgName} in namespace ${namespace}`,
          err,
        );
        // Don't throw here - we want to continue processing other packages
      }
    }

    // Also update the Istio sso-ca-cert secret with combined bundle
    try {
      log.debug("Updating Istio sso-ca-cert secret with combined CA bundle");
      await updateIstioCASecret();
      log.debug("Successfully updated Istio sso-ca-cert secret");
    } catch (err) {
      log.error("Failed to update Istio sso-ca-cert secret", err);
    }

    log.debug("Completed CA bundle ConfigMap updates for all UDS packages");
  } catch (err) {
    log.error("Failed to update CA bundle ConfigMaps for all packages", err);
    throw new Error("Failed to update CA bundle ConfigMaps for all packages", { cause: err });
  }
}
