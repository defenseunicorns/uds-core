/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as https from "https";
import * as fs from "fs";
import * as path from "path";
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
 * Retrieves DoD certificates from the official DoD PKI repository, downloads the ZIP archive,
 * extracts certificates to the specified directory, and cleans up the temporary ZIP file
 * @param dirName - The directory path where certificates should be extracted
 * @throws {Error} When download fails, extraction fails, or file operations fail
 * @returns Promise that resolves when download and extraction are complete
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

  // Download, extract, and clean up the DoD certificates zip file
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
 * Reads the unzipped directory structure for DoD certificates and inventories them
 * into an array of DoDCert objects. Validates each certificate format using Node.js crypto.
 * @param dirName - The base directory containing the extracted DoD certificates
 * @param targetDir - The target subdirectory name (defaults to TARGET_DOD_CERT_DIR for production)
 * @returns Promise that resolves to an array of DoDCert objects with validated certificates
 * @throws {Error} When directory traversal fails or certificate validation fails
 */
export async function inventoryDoDCertificates(
  dirName: string,
  targetDir: string = TARGET_DOD_CERT_DIR,
): Promise<DoDCert[]> {
  const certs: DoDCert[] = [];
  const certDir = path.join(dirName, targetDir);

  try {
    // Recursive function to walk through directories
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
 * Compares two arrays of DoDCert objects and returns differences including
 * added, removed, and modified certificates based on file path and content
 * @param existing - Array of existing DoD certificates
 * @param downloaded - Array of newly downloaded DoD certificates
 * @returns Object containing arrays of added, removed, and modified certificates
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
