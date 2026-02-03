/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../logger.js";
import { v1alpha1 as clusterConfig } from "./sources/cluster-config/v1alpha1.js";
import { v1alpha1 as exemption } from "./sources/exemption/v1alpha1.js";
import { v1alpha1 as pkg } from "./sources/package/v1alpha1.js";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_CRD);

export async function registerClusterConfig() {
  // Register the ClusterConfig CRD
  await K8s(kind.CustomResourceDefinition)
    .Apply(
      {
        apiVersion: "apiextensions.k8s.io/v1",
        kind: "CustomResourceDefinition",
        metadata: {
          name: "clusterconfig.uds.dev",
        },
        spec: {
          group: "uds.dev",
          versions: [clusterConfig],
          scope: "Cluster",
          names: {
            plural: "clusterconfig",
            singular: "clusterconfig",
            kind: "ClusterConfig",
          },
        },
      },
      { force: true },
    )
    .then(() => {
      log.info("ClusterConfig CRD registered");
    })
    .catch(err => {
      log.error({ err }, "Failed to register ClusterConfig CRD");

      // Sad times, let's exit
      process.exit(1);
    });
}

export async function registerCRDs() {
  // Register the Package CRD if we're in watch or dev mode
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    await K8s(kind.CustomResourceDefinition)
      .Apply(
        {
          apiVersion: "apiextensions.k8s.io/v1",
          kind: "CustomResourceDefinition",
          metadata: {
            name: "packages.uds.dev",
          },
          spec: {
            group: "uds.dev",
            versions: [pkg],
            scope: "Namespaced",
            names: {
              plural: "packages",
              singular: "package",
              kind: "Package",
              shortNames: ["pkg"],
            },
          },
        },
        { force: true },
      )
      .then(() => {
        log.info("Package CRD registered");
      })
      .catch(err => {
        log.error({ err }, "Failed to register Package CRD");

        // Sad times, let's exit
        process.exit(1);
      });
  }

  // Register the Exemption CRD if we're in "admission" or dev mode (Exemptions are watched by the admission controllers)
  if (process.env.PEPR_WATCH_MODE === "false" || process.env.PEPR_MODE === "dev") {
    await K8s(kind.CustomResourceDefinition)
      .Apply(
        {
          apiVersion: "apiextensions.k8s.io/v1",
          kind: "CustomResourceDefinition",
          metadata: {
            name: "exemptions.uds.dev",
          },
          spec: {
            group: "uds.dev",
            versions: [exemption],
            scope: "Namespaced",
            names: {
              plural: "exemptions",
              singular: "exemption",
              kind: "Exemption",
              shortNames: ["exempt"],
            },
          },
        },
        { force: true },
      )
      .then(() => {
        log.info("Exemption CRD registered");
      })
      .catch(err => {
        log.error({ err }, "Failed to register Exemption CRD");

        // Sad times, let's exit
        process.exit(1);
      });
  }
}
