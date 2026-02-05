/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import fs from "fs";
import yaml from "js-yaml";
import path from "path";

import { v1alpha1 as clusterConfig } from "../operator/crd/sources/cluster-config/v1alpha1.ts";
import { v1alpha1 as exemption } from "../operator/crd/sources/exemption/v1alpha1.ts";
import { v1alpha1 as pkg } from "../operator/crd/sources/package/v1alpha1.ts";

const HELM_TEMPLATE_DIR = path.resolve(__dirname, "../uds-cluster-crds/templates");
if (!fs.existsSync(HELM_TEMPLATE_DIR)) fs.mkdirSync(HELM_TEMPLATE_DIR, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeYamlToDir(filename: string, manifest: any) {
  const yamlStr = yaml.dump(manifest, { noRefs: true });
  fs.writeFileSync(path.join(HELM_TEMPLATE_DIR, filename), yamlStr);
}

// ClusterConfig CRD
const clusterConfigManifest = {
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
    versions: [clusterConfig],
  },
};

// Package CRD
const packageManifest = {
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
    versions: [pkg],
  },
};

// Exemption CRD
const exemptionManifest = {
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
    versions: [exemption],
  },
};

writeYamlToDir("clusterconfig.uds.dev.yaml", clusterConfigManifest);
writeYamlToDir("packages.uds.dev.yaml", packageManifest);
writeYamlToDir("exemptions.uds.dev.yaml", exemptionManifest);

console.log("CRD YAMLs generated.");
