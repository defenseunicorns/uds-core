/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  DoDCert,
  retrieveDoDCertificates,
  inventoryDoDCertificates,
  diffDoDCerts,
} from "./dod-certs";
import {
  retrievePublicCACertificates,
  extractCertificatesFromPEM,
  inventoryPublicCACertificates,
  readPublicCATrustConfig,
  filterPublicCACerts,
  writePublicCABundle,
  checkForUnaccountedCerts,
  downloadMozillaCSVData,
  enrichCertificatesWithCSVData,
} from "./public-certs";

const CERTS_BASE_DIR = "./certs"; // Base directory to store certificates
const TARGET_DOD_CERT_DIR = "dod"; // subdirectory in certs directory to put DoD certs
const PATH_TO_PUBLIC_CA_CONFIG = "./certs/public/uds-core-public-ca-trust-config.yaml";
const PATH_TO_CONFIGMAP = "./src/pepr/uds-operator-config/templates/uds-ca-certs.yaml"; // Path to the ConfigMap file that needs updated with base64 certs

/**
 * Convert DoD certificates to base64 and update ConfigMap YAML file
 */
async function updateConfigMapWithCerts(certs: DoDCert[]) {
  console.log(`Converting ${certs.length} certificates to base64...`);

  // Concatenate all certificate contents with normalized newlines, then base64 the whole thing
  const allCertContents = certs.map(cert => cert.content.trim()).join("\n");
  const base64Blob = Buffer.from(allCertContents, "utf8").toString("base64");

  // Read existing YAML file
  const yamlContent = await fs.promises.readFile(PATH_TO_CONFIGMAP, "utf8");

  // Replace the dodCACerts value in the YAML with the base64 blob
  const updatedYaml = yamlContent.replace(/dodCACerts: .*/, `dodCACerts: ${base64Blob}`);

  // Write back to file
  await fs.promises.writeFile(PATH_TO_CONFIGMAP, updatedYaml);
  console.log(`Updated ConfigMap at: ${PATH_TO_CONFIGMAP}`);
}

// Main execution
async function main() {
  // Parse command line arguments
  const isCheckMode = process.argv.includes("--check");

  try {
    let outputDir: string;

    if (isCheckMode) {
      // In check mode, use a temporary directory to download and extract certs
      outputDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dod-certs-"));

      // Download and extract DoD certs to temp directory
      await retrieveDoDCertificates(outputDir);

      // Inventory the downloaded certs
      const certs = await inventoryDoDCertificates(outputDir);

      // Inventory the existing certs from the standard location
      const existingCerts = await inventoryDoDCertificates(CERTS_BASE_DIR);

      // Calculate the diff
      const diff = diffDoDCerts(existingCerts, certs);

      console.log(`Diff Results:`);
      console.log(`Added: ${diff.added.length}`);
      console.log(`Removed: ${diff.removed.length}`);
      console.log(`Modified: ${diff.modified.length}`);

      if (diff.added.length > 0) {
        console.log("\nAdded certificates:");
        diff.added.forEach(cert => console.log(`+ ${cert.organization}: ${cert.filename}`));
      }

      if (diff.removed.length > 0) {
        console.log("\nRemoved certificates:");
        diff.removed.forEach(cert => console.log(`- ${cert.organization}: ${cert.filename}`));
      }

      if (diff.modified.length > 0) {
        console.log("\nModified certificates:");
        diff.modified.forEach(cert =>
          console.log(`~ ${cert.new.organization}: ${cert.new.filename}`),
        );
      }

      // error out if there are any differences
      if (diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0) {
        throw new Error("Differences detected in DoD certificates.");
      } else {
        console.log("No differences detected in DoD certificates.");
      }

      // Non-check mode, download and rewrite contents
    } else {
      outputDir = CERTS_BASE_DIR;

      // Clean up existing DoD certs directory before downloading new ones
      const dodCertPath = path.join(outputDir, TARGET_DOD_CERT_DIR);
      if (fs.existsSync(dodCertPath)) {
        fs.rmSync(dodCertPath, { recursive: true, force: true });
        console.log(`Cleared existing DoD certificates from: ${dodCertPath}`);
      }

      // Download and extract DoD certs to standard directory
      await retrieveDoDCertificates(outputDir);
      const certs = await inventoryDoDCertificates(outputDir);

      // Download public CA certificates and CSV metadata
      const publicCAContent = await retrievePublicCACertificates();
      const csvData = await downloadMozillaCSVData();
      const publicCertContents = extractCertificatesFromPEM(publicCAContent);
      const publicCertsRaw = inventoryPublicCACertificates(publicCertContents);
      console.log(`Found ${publicCertsRaw.length} public CA certificates in bundle`);

      // Enrich certificates with CSV metadata
      const publicCerts = enrichCertificatesWithCSVData(publicCertsRaw, csvData);
      console.log(`Enriched ${publicCerts.length} certificates with CSV metadata`);

      // Read trust configuration and check for unaccounted certificates
      const trustConfig = await readPublicCATrustConfig(PATH_TO_PUBLIC_CA_CONFIG);
      const unaccountedCerts = checkForUnaccountedCerts(publicCerts, trustConfig);

      // If certs are unaccounted for, log error with YAML entries for easy copy-paste
      if (unaccountedCerts.length > 0) {
        console.error(
          `\nError: Found ${unaccountedCerts.length} certificates that are not in the include or exclude list:`,
        );
        console.error("\nYAML entries for copy-paste into your config file:");
        console.error("include:");
        unaccountedCerts.forEach(cert => {
          console.error(`  - commonName: "${cert.commonName}"`);
          console.error(`    owner: "${cert.owner || "Unknown"}"`);
          console.error(
            `    certificateIssuerOrganization: "${cert.certificateIssuerOrganization || "Unknown"}"`,
          );
          console.error(`    geographicFocus: "${cert.geographicFocus || "Unknown"}"`);
          console.error(`    companyWebsite: ""`);
        });
        console.error(`\nPlease update the configuration file at: ${PATH_TO_PUBLIC_CA_CONFIG}`);
        console.error(
          'Copy the YAML entries above and add them to either the "include" or "exclude" list.',
        );
        throw new Error("Unaccounted certificates found in public CA bundle.");
      }

      // Filter certificates and write bundle
      const trustedCerts = filterPublicCACerts(publicCerts, trustConfig);
      console.log(`Filtered to ${trustedCerts.length} trusted certificates based on config`);

      // Write filtered certificates to ca-bundle.pem
      await writePublicCABundle(trustedCerts, outputDir);

      // Update ConfigMap with base64 encoded certificates
      await updateConfigMapWithCerts(certs);

      console.log(`Successfully updated ${certs.length} DoD certificates`);
    }
  } catch (error) {
    console.error(`${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
