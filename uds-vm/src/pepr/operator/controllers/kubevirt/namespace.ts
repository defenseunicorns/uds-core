/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import type { Operation } from "kubernetes-fluent-client";
import { Component, setupLogger } from "../../../logger.js";
import { Package } from "../../crd/package-v1alpha1.js";
import {
  KUBEVIRT_LABEL,
  KUBEVIRT_PKG_ANNOTATION_PREFIX,
  PRIVATE_REGISTRY_SECRET,
  PRIVATE_REGISTRY_SECRET_TYPE,
  SOURCE_NAMESPACE_CANDIDATES,
} from "./constants.js";

const log = setupLogger(Component.OPERATOR_KUBEVIRT);

/**
 * Handle Package create/update: translate kubevirt.enabled into namespace label.
 * Sets per-package annotation and derives the workload label.
 */
export async function handlePackage(pkg: Package) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error("Invalid Package definition, missing namespace or name");
  }

  // Skip if the Package is being deleted -- Finalize handler will clean up
  if (pkg.metadata.deletionTimestamp) {
    return;
  }

  const ns = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = { ...(ns.metadata?.labels || {}) };
  const annotations = { ...(ns.metadata?.annotations || {}) };

  const annotationKey = `${KUBEVIRT_PKG_ANNOTATION_PREFIX}${pkg.metadata.name}`;

  if (pkg.spec?.kubevirt?.enabled) {
    annotations[annotationKey] = "true";
  } else {
    delete annotations[annotationKey];
  }

  // Derive the label: if any kubevirt-pkg annotation is "true", set the label
  const hasKubevirt = Object.keys(annotations).some(
    k => k.startsWith(KUBEVIRT_PKG_ANNOTATION_PREFIX) && annotations[k] === "true",
  );
  if (hasKubevirt) {
    labels[KUBEVIRT_LABEL] = "true";
  } else {
    delete labels[KUBEVIRT_LABEL];
  }

  await K8s(kind.Namespace).Apply(
    {
      metadata: {
        name: pkg.metadata.namespace,
        labels,
        annotations,
      },
    },
    { force: true },
  );

  // Propagate private-registry secret if kubevirt is enabled
  if (pkg.spec?.kubevirt?.enabled) {
    await ensurePrivateRegistrySecret(pkg.metadata.namespace);
  }
}

/**
 * Handle Package delete: remove per-package annotation and clear label if no kubevirt packages remain.
 * Uses RFC 6902 JSON Patch (not SSA Apply) because SSA cannot delete omitted fields.
 */
export async function handlePackageDelete(pkg: Package) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error("Invalid Package definition, missing namespace or name");
  }

  const ns = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const annotations = ns.metadata?.annotations || {};
  const pkgName = pkg.metadata.name;

  // JSON Patch "remove" requires ~1 escaping for "/" in keys
  const patchOps: Operation[] = [
    { op: "remove", path: `/metadata/annotations/uds.dev~1kubevirt-pkg-${pkgName}` },
  ];

  // Check if any other kubevirt-pkg annotations remain
  const hasOtherKubevirt = Object.keys(annotations).some(
    k =>
      k.startsWith(KUBEVIRT_PKG_ANNOTATION_PREFIX) &&
      k !== `${KUBEVIRT_PKG_ANNOTATION_PREFIX}${pkgName}` &&
      annotations[k] === "true",
  );

  // If no other kubevirt packages remain, also remove the workload label
  if (!hasOtherKubevirt) {
    patchOps.push({ op: "remove", path: "/metadata/labels/uds.dev~1kubevirt-workload" });
  }

  log.info(`Removing KubeVirt annotation from namespace ${pkg.metadata.namespace}`);
  await K8s(kind.Namespace, { name: pkg.metadata.namespace }).Patch(patchOps);
}

/**
 * Ensure the private-registry Docker config secret exists in the target namespace.
 * KubeVirt pods need this to pull images from the Zarf registry.
 */
async function ensurePrivateRegistrySecret(targetNS: string): Promise<void> {
  try {
    await K8s(kind.Secret).InNamespace(targetNS).Get(PRIVATE_REGISTRY_SECRET);
    log.debug(`private-registry secret already exists in ${targetNS}`);
    return;
  } catch {
    // Secret doesn't exist in target namespace, need to copy it
  }

  // Try known source namespaces first, then scan
  let sourceSecret: kind.Secret | undefined;
  for (const ns of SOURCE_NAMESPACE_CANDIDATES) {
    try {
      sourceSecret = await K8s(kind.Secret).InNamespace(ns).Get(PRIVATE_REGISTRY_SECRET);
      break;
    } catch {
      // Continue to next candidate
    }
  }

  // Fall back to scanning all namespaces if candidates didn't work
  if (!sourceSecret) {
    try {
      const secrets = await K8s(kind.Secret).Get();
      sourceSecret = secrets.items.find(
        s =>
          s.metadata?.name === PRIVATE_REGISTRY_SECRET &&
          s.type === PRIVATE_REGISTRY_SECRET_TYPE &&
          s.metadata?.namespace !== targetNS,
      );
    } catch {
      // Global scan failed, will fall through to warn
    }
  }

  if (!sourceSecret?.data) {
    log.warn(`Could not find ${PRIVATE_REGISTRY_SECRET} secret to copy to ${targetNS}`);
    return;
  }

  await K8s(kind.Secret).Create({
    metadata: {
      name: PRIVATE_REGISTRY_SECRET,
      namespace: targetNS,
    },
    type: PRIVATE_REGISTRY_SECRET_TYPE,
    data: sourceSecret.data,
  });
  log.info(`Copied ${PRIVATE_REGISTRY_SECRET} secret to ${targetNS}`);
}
