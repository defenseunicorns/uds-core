/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as crypto from "crypto";
import { parse as parseCSV } from "csv-parse/sync";

export interface PublicCACert {
  commonName: string;
  content: string;
  certificateIssuerOrganization?: string;
  geographicFocus?: string;
  owner?: string;
  companyWebsite?: string;
}

interface PublicCATrustConfig {
  include: PublicCACert[];
  exclude: PublicCACert[];
}

interface MozillaCSVRecord {
  "Common Name or Certificate Name": string;
  "Certificate Issuer Organization": string;
  "Certificate Issuer Organizational Unit": string;
  "Geographic Focus": string;
  Owner: string;
  "Company Website": string;
  [key: string]: string; // Allow for other fields
}

const PUBLIC_CA_CERTS_URL = "https://curl.se/ca/cacert.pem";
const MOZILLA_CSV_URL =
  "https://ccadb.my.salesforce-sites.com/mozilla/IncludedRootCertificateReportCSVFormat";
const TARGET_PUBLIC_CERT_DIR = "public"; // subdirectory in certs directory to put public CA certs

/**
 * Retrieves public CA certificates bundle from curl.se (Mozilla's curated list)
 * and returns the raw PEM content as a string
 * @returns Promise that resolves to the raw PEM bundle content
 * @throws {Error} When HTTP request fails or returns non-200 status code
 */
export async function retrievePublicCACertificates(): Promise<string> {
  console.log("Starting public CA certificate download...");

  return new Promise<string>((resolve, reject) => {
    console.log(`Downloading from: ${PUBLIC_CA_CERTS_URL}`);

    https
      .get(PUBLIC_CA_CERTS_URL, response => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to get public CA certificates. Status code: ${response.statusCode}`),
          );
          return;
        }

        let data = "";
        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          console.log("Downloaded public CA certificates");
          resolve(data);
        });
      })
      .on("error", err => {
        reject(err);
      });
  });
}

/**
 * Downloads and parses Mozilla's Common CA Database (CCDB) CSV data containing
 * certificate metadata including issuer organization, geographic focus, and owner information
 * @returns Promise that resolves to an array of parsed CSV records
 * @throws {Error} When HTTP request fails or CSV parsing fails
 */
export async function downloadMozillaCSVData(): Promise<MozillaCSVRecord[]> {
  console.log("Downloading Mozilla CSV data...");

  return new Promise<MozillaCSVRecord[]>((resolve, reject) => {
    https
      .get(MOZILLA_CSV_URL, response => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get Mozilla CSV data. Status code: ${response.statusCode}`));
          return;
        }

        let data = "";
        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            const records = parseCSV(data, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
            }) as MozillaCSVRecord[];

            console.log(`Downloaded ${records.length} Mozilla CA records`);
            resolve(records);
          } catch (error) {
            reject(new Error(`Failed to parse CSV: ${error}`));
          }
        });
      })
      .on("error", err => {
        reject(err);
      });
  });
}

/**
 * Extracts individual certificates from a PEM bundle along with their preceding comments.
 * The certificate name is extracted from the comment block that precedes each certificate.
 * @param pemContent - The raw PEM bundle content containing multiple certificates
 * @returns Array of objects containing certificate name and PEM content
 */
export function extractCertificatesFromPEM(
  pemContent: string,
): { name: string; content: string }[] {
  const certRegex = /(.*?)\n=+\n(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/g;
  const matches = [];
  let match;

  while ((match = certRegex.exec(pemContent)) !== null) {
    const comment = match[1].trim();
    const certContent = match[2];

    // Extract certificate name from comment - it's usually the last line of the comment
    const commentLines = comment.split("\n").filter(line => line.trim().length > 0);
    const name = commentLines[commentLines.length - 1].trim();

    matches.push({
      name,
      content: certContent,
    });
  }

  return matches;
}

/**
 * Creates an inventory of public CA certificates, validating each certificate's format
 * using Node.js crypto library and converting to PublicCACert objects
 * @param certsWithNames - Array of certificates with extracted names and PEM content
 * @returns Array of validated PublicCACert objects
 * @throws {Error} When certificate validation fails
 */
export function inventoryPublicCACertificates(
  certsWithNames: { name: string; content: string }[],
): PublicCACert[] {
  return certsWithNames.map(({ name, content }) => {
    // Validate certificate format
    try {
      new crypto.X509Certificate(content);
    } catch (error) {
      throw new Error(
        `Invalid certificate ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      commonName: name,
      content,
    };
  });
}

/**
 * Enriches PublicCACert objects with metadata from Mozilla's CCDB CSV data.
 * Attempts exact matches, organizational unit matches, and case-insensitive matches.
 * Sets unknown values for certificates not found in the CSV data.
 * @param certs - Array of PublicCACert objects to enrich
 * @param csvRecords - Array of Mozilla CSV records containing metadata
 * @returns Array of enriched PublicCACert objects with additional metadata
 */
export function enrichCertificatesWithCSVData(
  certs: PublicCACert[],
  csvRecords: MozillaCSVRecord[],
): PublicCACert[] {
  const enrichedCerts: PublicCACert[] = [];
  const missingFromCSV: string[] = [];

  certs.forEach(cert => {
    // Try exact match in Common Name column
    let csvRecord = csvRecords.find(
      record => record["Common Name or Certificate Name"] === cert.commonName,
    );

    if (!csvRecord) {
      // Try searching in Certificate Issuer Organizational Unit column
      csvRecord = csvRecords.find(
        record => record["Certificate Issuer Organizational Unit"] === cert.commonName,
      );

      if (csvRecord) {
        console.log(
          `DEBUG: Found "${cert.commonName}" in Certificate Issuer Organizational Unit column`,
        );
      } else {
        // Try case-insensitive match in Common Name column
        csvRecord = csvRecords.find(
          record =>
            record["Common Name or Certificate Name"].toLowerCase() ===
            cert.commonName.toLowerCase(),
        );

        if (csvRecord) {
          console.log(
            `DEBUG: Found "${cert.commonName}" via case-insensitive match -> "${csvRecord["Common Name or Certificate Name"]}"`,
          );
        }
      }
    }

    if (csvRecord) {
      enrichedCerts.push({
        ...cert,
        certificateIssuerOrganization: csvRecord["Certificate Issuer Organization"],
        geographicFocus: csvRecord["Geographic Focus"],
        owner: csvRecord["Owner"],
        companyWebsite: csvRecord["Company Website"],
      });
    } else {
      enrichedCerts.push({
        ...cert,
        certificateIssuerOrganization: "unknown - not found in CSV",
        geographicFocus: "unknown - not found in CSV",
        owner: "unknown - not found in CSV",
        companyWebsite: "unknown - not found in CSV",
      });
      console.log(
        `DEBUG: Certificate "${cert.commonName}" not found - proceeding with unknown metadata`,
      );
      missingFromCSV.push(cert.commonName);
    }
  });

  if (missingFromCSV.length > 0) {
    console.warn(
      `\nWarning: Found ${missingFromCSV.length} certificates not present in Mozilla CSV data (proceeding without enrichment):`,
    );
    missingFromCSV.forEach(name => {
      console.warn(`  - ${name}`);
    });
  }

  return enrichedCerts;
}

/**
 * Reads and parses the public CA trust configuration YAML file containing
 * include and exclude lists for certificate filtering
 * @param configPath - Path to the YAML configuration file
 * @returns Promise that resolves to the parsed trust configuration
 * @throws {Error} When file reading or YAML parsing fails
 */
export async function readPublicCATrustConfig(configPath: string): Promise<PublicCATrustConfig> {
  try {
    const yamlContent = await fs.promises.readFile(configPath, "utf8");
    const config = yaml.load(yamlContent) as { include?: PublicCACert[]; exclude?: PublicCACert[] };

    return {
      include: Array.isArray(config?.include) ? config.include : [],
      exclude: Array.isArray(config?.exclude) ? config.exclude : [],
    };
  } catch (error) {
    console.warn(`Could not read trust config: ${error}`);
    return { include: [], exclude: [] };
  }
}

/**
 * Filters public CA certificates based on the trust configuration,
 * only including certificates that are explicitly listed in the include array
 * @param certs - Array of PublicCACert objects to filter
 * @param config - Trust configuration containing include/exclude lists
 * @returns Array of filtered PublicCACert objects that match the include criteria
 */
export function filterPublicCACerts(
  certs: PublicCACert[],
  config: PublicCATrustConfig,
): PublicCACert[] {
  return certs.filter(cert => {
    // Only include certificates that are explicitly in the include list (match by commonName)
    return (
      config.include &&
      config.include.some(includedCert => includedCert.commonName === cert.commonName)
    );
  });
}

/**
 * Checks for certificates that are not present in either the include or exclude lists.
 * If unaccounted certificates are found, prints detailed error information and throws an error.
 * @param certs - Array of PublicCACert objects to check
 * @param config - Trust configuration containing include/exclude lists
 * @param configPath - Path to the configuration file for error messages
 * @throws {Error} When unaccounted certificates are found
 */
export function checkForUnaccountedCerts(
  certs: PublicCACert[],
  config: PublicCATrustConfig,
  configPath: string,
): void {
  const includedNames = (config.include || []).map(cert => cert.commonName);
  const excludedNames = (config.exclude || []).map(cert => cert.commonName);

  const unaccountedCerts = certs.filter(
    cert => !includedNames.includes(cert.commonName) && !excludedNames.includes(cert.commonName),
  );

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
      console.error(`    companyWebsite: "${cert.companyWebsite || "Unknown"}"`);
    });
    console.error(`\nPlease update the configuration file at: ${configPath}`);
    console.error(
      'Copy the YAML entries above and add them to either the "include" or "exclude" list.',
    );
    throw new Error("Unaccounted certificates found in public CA bundle.");
  }
}

/**
 * Reads existing public CA bundle file and returns the certificates as PublicCACert objects.
 * Throws an error if the file cannot be read.
 * @param outputDir - Base directory where the bundle file is located
 * @returns Array of existing PublicCACert objects from the bundle file
 * @throws {Error} When the bundle file cannot be read or parsed
 */
export async function readExistingPublicCABundle(outputDir: string): Promise<PublicCACert[]> {
  const bundlePath = path.join(outputDir, TARGET_PUBLIC_CERT_DIR, "ca-bundle.pem");

  try {
    const bundleContent = await fs.promises.readFile(bundlePath, "utf8");
    const certsWithNames = extractCertificatesFromPEM(bundleContent);
    return inventoryPublicCACertificates(certsWithNames);
  } catch (error) {
    throw new Error(
      `Failed to read existing public CA bundle from ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Compares two arrays of PublicCACert objects and returns differences including
 * added, removed, and modified certificates based on commonName and content
 * @param existing - Array of existing public CA certificates
 * @param downloaded - Array of newly downloaded public CA certificates
 * @returns Object containing arrays of added, removed, and modified certificates
 */
export function diffPublicCACerts(existing: PublicCACert[], downloaded: PublicCACert[]) {
  const existingMap = new Map(existing.map(cert => [cert.commonName, cert]));
  const downloadedMap = new Map(downloaded.map(cert => [cert.commonName, cert]));

  const added = downloaded.filter(cert => !existingMap.has(cert.commonName));
  const removed = existing.filter(cert => !downloadedMap.has(cert.commonName));
  const modified = downloaded
    .filter(cert => {
      const existingCert = existingMap.get(cert.commonName);
      return existingCert && existingCert.content !== cert.content;
    })
    .map(cert => ({ old: existingMap.get(cert.commonName)!, new: cert }));

  return { added, removed, modified };
}

/**
 * Writes filtered CA certificates to a PEM bundle file with certificate names as headers.
 * Creates the output directory if it doesn't exist and formats certificates with separators.
 * @param certs - Array of PublicCACert objects to write to the bundle
 * @param outputDir - Base output directory where the bundle file will be created
 * @throws {Error} When directory creation or file writing fails
 */
export async function writePublicCABundle(certs: PublicCACert[], outputDir: string) {
  const bundleContent = certs
    .map(cert => {
      const separator = "=".repeat(cert.commonName.length);
      return `${cert.commonName}\n${separator}\n${cert.content}\n`;
    })
    .join("\n");
  const bundlePath = path.join(outputDir, TARGET_PUBLIC_CERT_DIR, "ca-bundle.pem");

  // Ensure directory exists
  const publicCertDir = path.join(outputDir, TARGET_PUBLIC_CERT_DIR);
  if (!fs.existsSync(publicCertDir)) {
    fs.mkdirSync(publicCertDir, { recursive: true });
  }

  await fs.promises.writeFile(bundlePath, bundleContent);
  console.log(`Wrote ${certs.length} trusted CA certificates to: ${bundlePath}`);
}
