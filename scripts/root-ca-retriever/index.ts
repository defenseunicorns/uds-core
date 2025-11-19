/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";
import {
  DoDCert,
  retrieveDoDCertificates,
  inventoryDoDCertificates,
  diffDoDCerts,
} from "./dod-certs";
import * as publicCerts from "./public-certs";

const CERTS_BASE_DIR = "./certs"; // Base directory to store certificates
const PATH_TO_CONFIGMAP = "./src/pepr/uds-operator-config/templates/uds-ca-certs.yaml"; // Path to the ConfigMap file that needs updated with base64 certs
const TARGET_DOD_CERT_DIR = "dod"; // subdirectory in certs directory to put DoD certs
const DEFAULT_PUBLIC_CA_CONFIG_PATH = "./certs/public/uds-core-public-ca-trust-config.yaml";

/**
 * Convert DoD and Public certificates to base64 and update ConfigMap YAML file
 * @param dodCerts - Array of DoD certificates to encode
 * @param publicCerts - Array of public CA certificates to encode
 * @param configMapPath - Optional path to ConfigMap file (defaults to hardcoded path)
 * @throws {Error} When unable to read or write the ConfigMap file
 */
export async function updateConfigMapWithCerts(
  dodCerts: DoDCert[],
  publicCerts: publicCerts.PublicCACert[],
  configMapPath: string = PATH_TO_CONFIGMAP,
) {
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
  const yamlContent = await fs.promises.readFile(configMapPath, "utf8");
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
  await fs.promises.writeFile(configMapPath, updatedYaml);
  console.log(`Updated ConfigMap at: ${configMapPath}`);
}

/**
 * Handles DoD certificate processing based on the specified mode.
 * In check mode, downloads to temporary directory and compares with existing certificates.
 * In normal mode, downloads and replaces existing certificates in the output directory.
 * @param checkMode - If true, performs diff check without replacing existing certificates
 * @param outputDir - The directory where certificates should be stored
 * @returns Promise that resolves to an array of processed DoDCert objects
 * @throws {Error} When differences are detected in check mode or processing fails
 */
export async function handleDoDCerts(checkMode: boolean, outputDir: string): Promise<DoDCert[]> {
  if (checkMode) {
    // In check mode, use a temporary directory to download and extract certs
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dod-certs-"));

    // Download and extract DoD certs to temp directory
    await retrieveDoDCertificates(tempDir);

    // Inventory the downloaded certs
    const certs = await inventoryDoDCertificates(tempDir);

    // Inventory the existing certs from the standard location
    const existingCerts = await inventoryDoDCertificates(outputDir);

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

    return certs;
  } else {
    // Clean up existing DoD certs directory before downloading new ones
    const dodCertPath = path.join(outputDir, TARGET_DOD_CERT_DIR);
    if (fs.existsSync(dodCertPath)) {
      fs.rmSync(dodCertPath, { recursive: true, force: true });
      console.log(`Cleared existing DoD certificates from: ${dodCertPath}`);
    }

    // Download and extract DoD certs to standard directory
    await retrieveDoDCertificates(outputDir);
    const certs = await inventoryDoDCertificates(outputDir);

    return certs;
  }
}

/**
 * Handles public certificate processing based on the specified mode.
 * In check mode, validates configuration without writing files.
 * In normal mode, processes certificates and writes the filtered bundle.
 * @param checkMode - If true, performs validation checks without writing output files
 * @param outputDir - Directory where certificate bundle should be written
 * @param configPath - Path to the trust configuration YAML file (optional, uses default if not provided)
 * @returns Promise that resolves to an array of processed PublicCACert objects
 * @throws {Error} When unaccounted certificates are found or processing fails
 */
export async function handlePublicCerts(
  checkMode: boolean,
  outputDir: string,
  configPath: string = DEFAULT_PUBLIC_CA_CONFIG_PATH,
): Promise<publicCerts.PublicCACert[]> {
  if (checkMode) {
    // In check mode, create temp bundle and compare with existing bundle
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "public-certs-"));

    try {
      // Download and process new certificates
      const publicCAContent = await publicCerts.retrievePublicCACertificates();
      const csvData = await publicCerts.downloadMozillaCSVData();
      const certsWithNames = publicCerts.extractCertificatesFromPEM(publicCAContent);
      const publicCertsRaw = publicCerts.inventoryPublicCACertificates(certsWithNames);
      console.log(`Found ${publicCertsRaw.length} public CA certificates in bundle`);

      // Enrich certificates with CSV metadata
      const publicCertsList = publicCerts.enrichCertificatesWithCSVData(publicCertsRaw, csvData);
      console.log(`Enriched ${publicCertsList.length} certificates with CSV metadata`);

      // Read trust configuration and check for unaccounted certificates
      const trustConfig = await publicCerts.readPublicCATrustConfig(configPath);
      publicCerts.checkForUnaccountedCerts(publicCertsList, trustConfig, configPath);

      // Filter certificates to get what would be written
      const trustedCerts = publicCerts.filterPublicCACerts(publicCertsList, trustConfig);
      console.log(`Filtered to ${trustedCerts.length} trusted certificates based on config`);

      // Write temp bundle for comparison
      await publicCerts.writePublicCABundle(trustedCerts, tempDir);

      // Read existing bundle and compare
      const existingCerts = await publicCerts.readExistingPublicCABundle(outputDir);
      const diff = publicCerts.diffPublicCACerts(existingCerts, trustedCerts);

      console.log(`Diff Results:`);
      console.log(`Added: ${diff.added.length}`);
      console.log(`Removed: ${diff.removed.length}`);
      console.log(`Modified: ${diff.modified.length}`);

      if (diff.added.length > 0) {
        console.log("\nAdded certificates:");
        diff.added.forEach(cert => console.log(`+ ${cert.commonName}`));
      }

      if (diff.removed.length > 0) {
        console.log("\nRemoved certificates:");
        diff.removed.forEach(cert => console.log(`- ${cert.commonName}`));
      }

      if (diff.modified.length > 0) {
        console.log("\nModified certificates:");
        diff.modified.forEach(cert => console.log(`~ ${cert.new.commonName}`));
      }

      // Error out if there are any differences
      if (diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0) {
        throw new Error("Differences detected in public CA certificates.");
      } else {
        console.log("No differences detected in public CA certificates.");
      }

      return publicCertsList;
    } finally {
      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  } else {
    // Process and write certificates
    const publicCAContent = await publicCerts.retrievePublicCACertificates();
    const csvData = await publicCerts.downloadMozillaCSVData();
    const certsWithNames = publicCerts.extractCertificatesFromPEM(publicCAContent);
    const publicCertsRaw = publicCerts.inventoryPublicCACertificates(certsWithNames);
    console.log(`Found ${publicCertsRaw.length} public CA certificates in bundle`);

    // Enrich certificates with CSV metadata
    const publicCertsList = publicCerts.enrichCertificatesWithCSVData(publicCertsRaw, csvData);
    console.log(`Enriched ${publicCertsList.length} certificates with CSV metadata`);

    // Read trust configuration and check for unaccounted certificates
    const trustConfig = await publicCerts.readPublicCATrustConfig(configPath);
    publicCerts.checkForUnaccountedCerts(publicCertsList, trustConfig, configPath);

    // Filter certificates and write bundle
    const trustedCerts = publicCerts.filterPublicCACerts(publicCertsList, trustConfig);
    console.log(`Filtered to ${trustedCerts.length} trusted certificates based on config`);

    // Write filtered public certificates to ca-bundle.pem
    await publicCerts.writePublicCABundle(trustedCerts, outputDir);

    return trustedCerts;
  }
}

/**
 * Main execution function that orchestrates DoD and public certificate processing
 * @throws {Error} When certificate processing fails or validation errors occur
 */
async function main() {
  // Parse command line arguments
  const isCheckMode = process.argv.includes("--check");

  const outputDir = CERTS_BASE_DIR;
  const errors: string[] = [];
  let dodCerts: DoDCert[] = [];
  let publicCerts: publicCerts.PublicCACert[] = [];

  // Handle DoD certificates with individual error handling in check mode
  try {
    dodCerts = await handleDoDCerts(isCheckMode, outputDir);
  } catch (error) {
    if (isCheckMode) {
      errors.push(`DoD certificates: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.error(`${error}`);
      process.exit(1);
    }
  }

  // Handle public certificates with individual error handling in check mode
  try {
    publicCerts = await handlePublicCerts(isCheckMode, outputDir);
  } catch (error) {
    if (isCheckMode) {
      errors.push(`Public certificates: ${error instanceof Error ? error.message : String(error)}`);
    } else {
      console.error(`${error}`);
      process.exit(1);
    }
  }

  // In check mode, report all collected errors
  if (isCheckMode && errors.length > 0) {
    console.error(`\nFound ${errors.length} issue(s):`);
    errors.forEach((error, index) => {
      console.error(`${index + 1}. ${error}`);
    });
    process.exit(1);
  }

  // Only proceed with ConfigMap update if not in check mode and no errors occurred
  if (!isCheckMode) {
    try {
      await updateConfigMapWithCerts(dodCerts, publicCerts);
      console.log(
        `Successfully updated ${dodCerts.length} DoD certificates and ${publicCerts.length} public certificates`,
      );
    } catch (error) {
      console.error(`${error}`);
      process.exit(1);
    }
  }
}

// Only run main if this file is executed directly (not imported)
if (require.main === module) {
  main().catch(console.error);
}
