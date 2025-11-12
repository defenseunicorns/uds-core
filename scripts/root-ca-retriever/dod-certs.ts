/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import AdmZip from "adm-zip";

export interface DoDCert {
  filepath: string; // Folder path within the zip
  filename: string; // Certificate file name
  content: string; // Certificate content
  organization: string; // Organization name (folder name)
}

const DOD_CERTS_ZIP_NAME = "unclass-dod_approved_external_pkis_trust_chains.zip";
const DOD_CERTS_URL = `https://dl.dod.cyber.mil/wp-content/uploads/pki-pke/zip/${DOD_CERTS_ZIP_NAME}`;
const TARGET_DOD_CERT_DIR = "dod"; // subdirectory in certs directory to put DoD certs

/**
 * Function to retrieve DoD Certificates, extract them,
 * and write to specified directory
 */
export async function retrieveDoDCertificates(dirName: string) {
  console.log("Starting DoD certificate download...");
  const downloadOutputFilePath = `${dirName}/${DOD_CERTS_ZIP_NAME}`;
  const fileStream = fs.createWriteStream(downloadOutputFilePath);
  const outputDir = `${dirName}/${TARGET_DOD_CERT_DIR}`;

  // If the directory does not exist, create it
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName);
    console.log(`Created directory: ${dirName}`);
  }

  return new Promise<void>((resolve, reject) => {
    console.log(`Downloading from: ${DOD_CERTS_URL}`);
    https
      .get(DOD_CERTS_URL, response => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get DoD certificates. Status code: ${response.statusCode}`));
          return;
        }

        response.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          console.log("Download complete, extracting certificates...");

          // Extract the zip file
          try {
            const zip = new AdmZip(downloadOutputFilePath);
            zip.extractAllTo(outputDir, true);
            console.log(`Extracted certificates to: ${outputDir}`);

            fs.unlinkSync(downloadOutputFilePath);
            console.log("Certificate retrieval complete");
            resolve();
          } catch (err) {
            reject(new Error(`Failed to extract DoD certificates: ${err}`));
          }
        });
      })
      .on("error", err => {
        fs.unlink(downloadOutputFilePath, () => {
          reject(err);
        });
      });
  });
}

/**
 * Function that reads the unzipped directory structure for DoD certificates
 * and inventories them into an array of DoDCert objects
 * @return Array of DoDCert objects
 */
export async function inventoryDoDCertificates(dirName: string): Promise<DoDCert[]> {
  const certs: DoDCert[] = [];
  const certDir = path.join(dirName, TARGET_DOD_CERT_DIR);

  try {
    const walkDirectory = async (currentDir: string): Promise<void> => {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await walkDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === ".cer") {
            // Read as binary to handle both PEM and DER formats
            const binaryContent = await fs.promises.readFile(fullPath);

            // Validate and convert to PEM using crypto library
            let content: string;
            try {
              const cert = new crypto.X509Certificate(binaryContent);
              content = cert.toString(); // This returns PEM format
            } catch (error) {
              throw new Error(
                `Invalid certificate ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }

            // Get the organization folder - find the folder directly under the version directory
            const relativePath = path.relative(certDir, fullPath);
            const pathParts = relativePath.split(path.sep);
            const organization = pathParts[1] || "Unknown"; // Skip version folder [0], take org folder [1]

            const cert: DoDCert = {
              filepath: path.dirname(fullPath),
              filename: entry.name,
              content: content,
              organization: organization,
            };
            certs.push(cert);
          }
        }
      }
    };

    await walkDirectory(certDir);
    return certs;
  } catch (error) {
    throw new Error(`Failed to inventory certificates: ${error}`);
  }
}

/**
 * Compare two arrays of DoDCert objects and return differences
 */
export function diffDoDCerts(existing: DoDCert[], downloaded: DoDCert[]) {
  // Strip base path and use relative path from /dod/ onwards as key
  const getKey = (cert: DoDCert) => {
    const dodIndex = cert.filepath.indexOf(`/${TARGET_DOD_CERT_DIR}/`);
    const relativePath = cert.filepath.substring(dodIndex);
    return `${relativePath}/${cert.filename}`;
  };

  const existingMap = new Map(existing.map(cert => [getKey(cert), cert]));
  const downloadedMap = new Map(downloaded.map(cert => [getKey(cert), cert]));

  const added = downloaded.filter(cert => !existingMap.has(getKey(cert)));
  const removed = existing.filter(cert => !downloadedMap.has(getKey(cert)));
  const modified = downloaded
    .filter(cert => {
      const key = getKey(cert);
      const existingCert = existingMap.get(key);
      return existingCert && existingCert.content !== cert.content;
    })
    .map(cert => ({ old: existingMap.get(getKey(cert))!, new: cert }));

  return { added, removed, modified };
}

/**
 * Handle DoD certificate processing based on check mode
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
