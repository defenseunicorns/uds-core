/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1CustomResourceDefinition } from "@kubernetes/client-node";

import { v1alpha1 as clusterConfigVersion } from "./cluster-config/v1alpha1.ts";
import { v1alpha1 as exemptionVersion } from "./exemption/v1alpha1.ts";
import { v1alpha1 as packageVersion } from "./package/v1alpha1.ts";

export const clusterConfigCRD: V1CustomResourceDefinition = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: { name: "clusterconfig.uds.dev" },
  spec: {
    group: "uds.dev",
    scope: "Cluster",
    names: {
      plural: "clusterconfig",
      singular: "clusterconfig",
      kind: "ClusterConfig",
      listKind: "ClusterConfigList",
    },
    versions: [clusterConfigVersion],
  },
};

export const packageCRD: V1CustomResourceDefinition = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: { name: "packages.uds.dev" },
  spec: {
    group: "uds.dev",
    scope: "Namespaced",
    names: {
      plural: "packages",
      singular: "package",
      kind: "Package",
      listKind: "PackageList",
      shortNames: ["pkg"],
    },
    versions: [packageVersion],
  },
};

export const exemptionCRD: V1CustomResourceDefinition = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: { name: "exemptions.uds.dev" },
  spec: {
    group: "uds.dev",
    scope: "Namespaced",
    names: {
      plural: "exemptions",
      singular: "exemption",
      kind: "Exemption",
      listKind: "ExemptionList",
      shortNames: ["exempt"],
    },
    versions: [exemptionVersion],
  },
};
