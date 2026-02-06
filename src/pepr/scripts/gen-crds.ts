/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import fs from "fs";
import yaml from "js-yaml";
import path from "path";

import { clusterConfigCRD, exemptionCRD, packageCRD } from "../operator/crd/sources/definitions.ts";

const HELM_TEMPLATE_DIR = path.resolve(__dirname, "../uds-cluster-crds/templates");
if (!fs.existsSync(HELM_TEMPLATE_DIR)) fs.mkdirSync(HELM_TEMPLATE_DIR, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeYamlToDir(filename: string, manifest: any) {
  const yamlStr = yaml.dump(manifest, { noRefs: true });
  fs.writeFileSync(path.join(HELM_TEMPLATE_DIR, filename), yamlStr);
}

writeYamlToDir("clusterconfig.uds.dev.yaml", clusterConfigCRD);
writeYamlToDir("packages.uds.dev.yaml", packageCRD);
writeYamlToDir("exemptions.uds.dev.yaml", exemptionCRD);

console.log("CRD YAMLs generated.");
