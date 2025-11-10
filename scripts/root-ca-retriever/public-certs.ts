/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as yaml from "js-yaml";
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
  exclude: string[];
}

interface MozillaCSVRecord {
  "Common Name or Certificate Name": string;
  "Certificate Issuer Organization": string;
  "Geographic Focus": string;
  Owner: string;
  [key: string]: string; // Allow for other fields
}

const PUBLIC_CA_CERTS_URL = "https://curl.se/ca/cacert.pem";
const MOZILLA_CSV_URL =
  "https://ccadb.my.salesforce-sites.com/mozilla/IncludedRootCertificateReportCSVFormat";
const TARGET_PUBLIC_CERT_DIR = "public"; // subdirectory in certs directory to put public CA certs

/**
 * Function to retrieve public CA certificates from curl.se and return content
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
 * Download and parse Mozilla CSV data
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
 * Extract individual certificates from PEM bundle
 */
export function extractCertificatesFromPEM(pemContent: string): string[] {
  const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  return pemContent.match(certRegex) || [];
}

/**
 * Inventory public CA certificates and extract common names
 */
export function inventoryPublicCACertificates(certContents: string[]): PublicCACert[] {
  return certContents.map(content => {
    try {
      const x509 = new crypto.X509Certificate(content);
      const subject = x509.subject;

      // Parse CN from subject string - extract everything between "CN=" and the next comma or end of string
      const cnMatch = subject.match(/CN=([^,\n\r]+)/);
      const commonName = cnMatch ? cnMatch[1].trim() : "Unknown";

      return {
        commonName,
        content,
      };
    } catch (error) {
      console.warn(`Failed to parse certificate: ${error}`);
      return {
        commonName: "Parse Error",
        content,
      };
    }
  });
}

/**
 * Enrich PublicCACert objects with metadata from Mozilla CSV
 */
export function enrichCertificatesWithCSVData(
  certs: PublicCACert[],
  csvRecords: MozillaCSVRecord[],
): PublicCACert[] {
  // Create a map for quick lookup by certificate name
  const csvMap = new Map<string, MozillaCSVRecord>();
  csvRecords.forEach(record => {
    csvMap.set(record["Common Name or Certificate Name"], record);
  });

  const enrichedCerts: PublicCACert[] = [];
  const missingFromCSV: string[] = [];

  certs.forEach(cert => {
    const csvRecord = csvMap.get(cert.commonName);
    if (csvRecord) {
      enrichedCerts.push({
        ...cert,
        certificateIssuerOrganization: csvRecord["Certificate Issuer Organization"],
        geographicFocus: csvRecord["Geographic Focus"],
        owner: csvRecord["Owner"],
      });
    } else {
      missingFromCSV.push(cert.commonName);
    }
  });

  if (missingFromCSV.length > 0) {
    console.error(
      `\nError: Found ${missingFromCSV.length} certificates not present in Mozilla CSV data:`,
    );
    missingFromCSV.forEach(name => {
      console.error(`  - ${name}`);
    });
    throw new Error("Some certificates could not be enriched with CSV metadata.");
  }

  return enrichedCerts;
}

/**
 * Read public CA trust configuration
 */
export async function readPublicCATrustConfig(configPath: string): Promise<PublicCATrustConfig> {
  try {
    const yamlContent = await fs.promises.readFile(configPath, "utf8");
    const config = yaml.load(yamlContent) as { include?: PublicCACert[]; exclude?: string[] };

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
 * Filter public CA certificates based on trust configuration
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
 * Check for certificates that are not in include/exclude lists and return unaccounted certs
 */
export function checkForUnaccountedCerts(
  certs: PublicCACert[],
  config: PublicCATrustConfig,
): PublicCACert[] {
  const includedNames = (config.include || []).map(cert => cert.commonName);
  const excludedNames = config.exclude || [];
  const allAccountedNames = [...includedNames, ...excludedNames];

  return certs.filter(cert => !allAccountedNames.includes(cert.commonName));
}

/**
 * Write filtered CA certificates to bundle file
 */
export async function writePublicCABundle(certs: PublicCACert[], outputDir: string) {
  const bundleContent = certs.map(cert => cert.content).join("\n");
  const bundlePath = path.join(outputDir, TARGET_PUBLIC_CERT_DIR, "ca-bundle.pem");

  // Ensure directory exists
  const publicCertDir = path.join(outputDir, TARGET_PUBLIC_CERT_DIR);
  if (!fs.existsSync(publicCertDir)) {
    fs.mkdirSync(publicCertDir, { recursive: true });
  }

  await fs.promises.writeFile(bundlePath, bundleContent);
  console.log(`Wrote ${certs.length} trusted CA certificates to: ${bundlePath}`);
}
