/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

const injectionLabel = "istio-injection";
const injectionAnnotation = "uds.dev/original-istio-injection";

/**
 * Restores the namespace
 *
 * @param pkg the package to cleanup
 */
export async function cleanupNamespace(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace || !pkg.metadata.name) {
    throw new Error(`Invalid Package definition, missing namespace or name`);
  }

  const sourceNS = await K8s(kind.Namespace).Get(pkg.metadata.namespace);
  const labels = sourceNS.metadata?.labels || {};
  const originalInjectionLabel = labels[injectionLabel];
  const annotations = sourceNS.metadata?.annotations || {};

  // Remove the package annotation
  delete annotations[`uds.dev/pkg-${pkg.metadata.name}`];

  // If there are no more UDS Package annotations, restore the original value of the istio-injection label
  if (!Object.keys(annotations).find(key => key.startsWith("uds.dev/pkg-"))) {
    labels[injectionLabel] = annotations[injectionAnnotation];
    // If the original value was non-existent, remove the label
    if (labels[injectionLabel] === "non-existent") {
      delete labels[injectionLabel];
    }
    delete annotations[injectionAnnotation];
  }

  // Apply the updated Namespace
  log.debug(`Updating namespace ${pkg.metadata.namespace}, removing istio injection labels.`);
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

  // Kill the pods if we changed the value of the istio-injection label
  if (originalInjectionLabel !== labels[injectionLabel]) {
    log.debug(
      `Attempting pod restart in ${pkg.metadata.namespace} based on istio injection label change`,
    );
    await killPods(pkg.metadata.namespace, false);
  }
}
