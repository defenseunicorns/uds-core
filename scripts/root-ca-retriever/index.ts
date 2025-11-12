/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import { DoDCert, handleDoDCerts } from "./dod-certs";
import { PublicCACert, handlePublicCerts } from "./public-certs";

const CERTS_BASE_DIR = "./certs"; // Base directory to store certificates
const PATH_TO_PUBLIC_CA_CONFIG = "./certs/public/uds-core-public-ca-trust-config.yaml";
const PATH_TO_CONFIGMAP = "./src/pepr/uds-operator-config/templates/uds-ca-certs.yaml"; // Path to the ConfigMap file that needs updated with base64 certs

/**
 * Convert DoD and Public certificates to base64 and update ConfigMap YAML file
 */
async function updateConfigMapWithCerts(dodCerts: DoDCert[], publicCerts: PublicCACert[]) {
  console.log(
    `Converting ${dodCerts.length} DoD certificates and ${publicCerts.length} public certificates to base64...`,
  );

  // Concatenate all DoD certificate contents with normalized newlines, then base64 the whole thing
  const allDoDCertContents = dodCerts.map(cert => cert.content.trim()).join("\n");
  const dodBase64Blob = Buffer.from(allDoDCertContents, "utf8").toString("base64");

  // Concatenate all public certificate contents with normalized newlines, then base64 the whole thing
  const allPublicCertContents = publicCerts.map(cert => cert.content.trim()).join("\n");
  const publicBase64Blob = Buffer.from(allPublicCertContents, "utf8").toString("base64");

  // Read existing YAML file
  const yamlContent = await fs.promises.readFile(PATH_TO_CONFIGMAP, "utf8");
  const configMap = yaml.load(yamlContent) as {
    data: { dodCACerts: string; publicCACerts: string };
  };

  // Update both certificate values in the parsed YAML
  configMap.data.dodCACerts = dodBase64Blob;
  configMap.data.publicCACerts = publicBase64Blob;

  // Write back to file with proper YAML formatting for long base64 strings
  const updatedYaml = yaml.dump(configMap, {
    lineWidth: -1, // Disable line wrapping
    noRefs: true, // Disable references
    quotingType: '"', // Use double quotes
    forceQuotes: false,
  });
  await fs.promises.writeFile(PATH_TO_CONFIGMAP, updatedYaml);
  console.log(`Updated ConfigMap at: ${PATH_TO_CONFIGMAP}`);
}

// Main execution
async function main() {
  // Parse command line arguments
  const isCheckMode = process.argv.includes("--check");

  try {
    const outputDir = isCheckMode ? CERTS_BASE_DIR : CERTS_BASE_DIR;

    // Handle DoD certificates
    const dodCerts = await handleDoDCerts(isCheckMode, outputDir);

    // Handle public certificates
    const publicCerts = await handlePublicCerts(isCheckMode, outputDir, PATH_TO_PUBLIC_CA_CONFIG);

    if (!isCheckMode) {
      // Update ConfigMap with base64 encoded certificates
      await updateConfigMapWithCerts(dodCerts, publicCerts);
      console.log(
        `Successfully updated ${dodCerts.length} DoD certificates and ${publicCerts.length} public certificates`,
      );
    }
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
