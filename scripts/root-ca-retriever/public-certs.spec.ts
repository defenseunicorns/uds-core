/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  diffPublicCACerts,
  filterPublicCACerts,
  extractCertificatesFromPEM,
  inventoryPublicCACertificates,
  enrichCertificatesWithCSVData,
  checkForUnaccountedCerts,
  readPublicCATrustConfig,
  writePublicCABundle,
  readExistingPublicCABundle,
  PublicCACert,
} from "./public-certs";

describe("public-certs", () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;
  let consoleWarnSpy: MockInstance;

  // Real PEM certificate for testing
  const realPEMCert = `-----BEGIN CERTIFICATE-----
MIIFtzCCA5+gAwIBAgICBQkwDQYJKoZIhvcNAQEFBQAwRTELMAkGA1UEBhMCQk0xGTAXBgNVBAoT
EFF1b1ZhZGlzIExpbWl0ZWQxGzAZBgNVBAMTElF1b1ZhZGlzIFJvb3QgQ0EgMjAeFw0wNjExMjQx
ODI3MDBaFw0zMTExMjQxODIzMzNaMEUxCzAJBgNVBAYTAkJNMRkwFwYDVQQKExBRdW9WYWRpcyBM
aW1pdGVkMRswGQYDVQQDExJRdW9WYWRpcyBSb290IENBIDIwggIiMA0GCSqGSIb3DQEBAQUAA4IC
DwAwggIKAoICAQCaGMpLlA0ALa8DKYrwD4HIrkwZhR0In6spRIXzL4GtMh6QRr+jhiYaHv5+HBg6
XJxgFyo6dIMzMH1hVBHL7avg5tKifvVrbxi3Cgst/ek+7wrGsxDp3MJGF/hd/aTa/55JWpzmM+Yk
lvcUulsrHHo1wtZn/qtmUIttKGAr79dgw8eTvI02kfN/+NsRE8Scd3bBrrcCaoF6qUWD4gXmuVbB
lDePSHFjIuwXZQeVikvfj8ZaCuWw419eaxGrDPmF60Tp+ARz8un+XJiM9XOva7R+zdRcAitMOeGy
lZUtQofX1bOQQ7dsE/He3fbE+Ik/0XX1ksOR1YqI0JDs3G3eicJlcZaLDQP9nL9bFqyS2+r+eXyt
66/3FsvbzSUr5R/7mp/iUcw6UwxI5g69ybR2BlLmEROFcmMDBOAENisgGQLodKcftslWZvB1Jdxn
wQ5hYIizPtGo/KPaHbDRsSNU30R2be1B2MGyIrZTHN81Hdyhdyox5C315eXbyOD/5YDXC2Og/zOh
D7osFRXql7PSorW+8oyWHhqPHWykYTe5hnMz15eWniN9gqRMgeKh0bpnX5UHoycR7hYQe7xFSkyy
BNKr79X9DFHOUGoIMfmR2gyPZFwDwzqLID9ujWc9Otb+fVuIyV77zGHcizN300QyNQliBJIWENie
J0f7OyHj+OsdWwIDAQABo4GwMIGtMA8GA1UdEwEB/wQFMAMBAf8wCwYDVR0PBAQDAgEGMB0GA1Ud
DgQWBBQahGK8SEwzJQTU7tD2A8QZRtGUazBuBgNVHSMEZzBlgBQahGK8SEwzJQTU7tD2A8QZRtGU
a6FJpEcwRTELMAkGA1UEBhMCQk0xGTAXBgNVBAoTEFF1b1ZhZGlzIExpbWl0ZWQxGzAZBgNVBAMT
ElF1b1ZhZGlzIFJvb3QgQ0EgMoICBQkwDQYJKoZIhvcNAQEFBQADggIBAD4KFk2fBluornFdLwUv
Z+YTRYPENvbzwCYMDbVHZF34tHLJRqUDGCdViXh9duqWNIAXINzng/iN/Ae42l9NLmeyhP3ZRPx3
UIHmfLTJDQtyU/h2BwdBR5YM++CCJpNVjP4iH2BlfF/nJrP3MpCYUNQ3cVX2kiF495V5+vgtJodm
VjB3pjd4M1IQWK4/YY7yarHvGH5KWWPKjaJW1acvvFYfzznB4vsKqBUsfU16Y8Zsl0Q80m/DShcK
+JDSV6IZUaUtl0HaB0+pUNqQjZRG4T7wlP0QADj1O+hA4bRuVhogzG9Yje0uRY/W6ZM/57Es3zrW
IozchLsib9D45MY56QSIPMO661V6bYCZJPVsAfv4l7CUW+v90m/xd2gNNWQjrLhVoQPRTUIZ3Ph1
WVaj+ahJefivDrkRoHy3au000LYmYjgahwz46P0u05B/B5EqHdZ+XIWDmbA4CD/pXvk1B+TJYm5X
f6dQlfe6yJvmjqIBxdZmv3lh8zwc4bmCXF2gw+nYSL0ZohEUGW6yhhtoPkg3Goi3XZZenMfvJ2II
4pEZXNLxId26F0KCl3GBUzGpn/Z9Yr9y4aOTHcyKJloJONDO1w2AFrR4pTqHTI2KpdVGl/IsELm8
VCLAAVBpQ570su9t+Oza8eOx79+Rj1QqCyXBJhnEUhAFZdWCEOrCMc0u
-----END CERTIFICATE-----`;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("diffPublicCACerts", () => {
    it("should detect no differences when certificates are identical", () => {
      const existing: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
          certificateIssuerOrganization: "Test Org",
          geographicFocus: "US",
          companyWebsite: "https://test.com",
        },
        {
          commonName: "Another Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test2\n-----END CERTIFICATE-----",
          owner: "Another Owner",
          certificateIssuerOrganization: "Another Org",
          geographicFocus: "EU",
          companyWebsite: "https://another.com",
        },
      ];

      const downloaded: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
          certificateIssuerOrganization: "Test Org",
          geographicFocus: "US",
          companyWebsite: "https://test.com",
        },
        {
          commonName: "Another Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test2\n-----END CERTIFICATE-----",
          owner: "Another Owner",
          certificateIssuerOrganization: "Another Org",
          geographicFocus: "EU",
          companyWebsite: "https://another.com",
        },
      ];

      const result = diffPublicCACerts(existing, downloaded);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it("should detect added certificates", () => {
      const existing: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
        },
      ];

      const downloaded: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
        },
        {
          commonName: "New Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...new\n-----END CERTIFICATE-----",
          owner: "New Owner",
        },
      ];

      const result = diffPublicCACerts(existing, downloaded);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].commonName).toBe("New Root CA");
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it("should detect removed certificates", () => {
      const existing: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
        },
        {
          commonName: "Old Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...old\n-----END CERTIFICATE-----",
          owner: "Old Owner",
        },
      ];

      const downloaded: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...test1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
        },
      ];

      const result = diffPublicCACerts(existing, downloaded);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].commonName).toBe("Old Root CA");
      expect(result.modified).toHaveLength(0);
    });

    it("should detect modified certificates based on content", () => {
      const existing: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...old_content\n-----END CERTIFICATE-----",
          owner: "Test Owner",
        },
      ];

      const downloaded: PublicCACert[] = [
        {
          commonName: "Test Root CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...new_content\n-----END CERTIFICATE-----",
          owner: "Test Owner",
        },
      ];

      const result = diffPublicCACerts(existing, downloaded);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].old.content).toContain("old_content");
      expect(result.modified[0].new.content).toContain("new_content");
      expect(result.modified[0].new.commonName).toBe("Test Root CA");
    });

    it("should handle complex scenarios with multiple changes", () => {
      const existing: PublicCACert[] = [
        {
          commonName: "Unchanged CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...unchanged\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
        {
          commonName: "Modified CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...old\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
        {
          commonName: "Removed CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...removed\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
      ];

      const downloaded: PublicCACert[] = [
        {
          commonName: "Unchanged CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...unchanged\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
        {
          commonName: "Modified CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...new\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
        {
          commonName: "Added CA",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...added\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
      ];

      const result = diffPublicCACerts(existing, downloaded);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].commonName).toBe("Added CA");
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].commonName).toBe("Removed CA");
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].new.commonName).toBe("Modified CA");
    });

    it("should handle empty arrays gracefully", () => {
      const result1 = diffPublicCACerts([], []);
      expect(result1.added).toHaveLength(0);
      expect(result1.removed).toHaveLength(0);
      expect(result1.modified).toHaveLength(0);

      const existing: PublicCACert[] = [
        {
          commonName: "Test CA",
          content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
          owner: "Owner",
        },
      ];

      const result2 = diffPublicCACerts(existing, []);
      expect(result2.added).toHaveLength(0);
      expect(result2.removed).toHaveLength(1);
      expect(result2.modified).toHaveLength(0);

      const result3 = diffPublicCACerts([], existing);
      expect(result3.added).toHaveLength(1);
      expect(result3.removed).toHaveLength(0);
      expect(result3.modified).toHaveLength(0);
    });
  });

  describe("filterPublicCACerts", () => {
    const mockCerts: PublicCACert[] = [
      {
        commonName: "VeriSign Root CA",
        content: "-----BEGIN CERTIFICATE-----\nverisign\n-----END CERTIFICATE-----",
        owner: "VeriSign",
      },
      {
        commonName: "DigiCert Root CA",
        content: "-----BEGIN CERTIFICATE-----\ndigicert\n-----END CERTIFICATE-----",
        owner: "DigiCert",
      },
      {
        commonName: "GlobalSign Root CA",
        content: "-----BEGIN CERTIFICATE-----\nglobalsign\n-----END CERTIFICATE-----",
        owner: "GlobalSign",
      },
    ];

    it("should include certificates that are in the include list", () => {
      const config = {
        include: [
          { commonName: "VeriSign Root CA", content: "", owner: "" },
          { commonName: "DigiCert Root CA", content: "", owner: "" },
        ],
        exclude: [],
      };

      const result = filterPublicCACerts(mockCerts, config);

      expect(result).toHaveLength(2);
      expect(result.map(cert => cert.commonName)).toEqual(["VeriSign Root CA", "DigiCert Root CA"]);
    });

    it("should exclude certificates not in the include list", () => {
      const config = {
        include: [{ commonName: "VeriSign Root CA", content: "", owner: "" }],
        exclude: [],
      };

      const result = filterPublicCACerts(mockCerts, config);

      expect(result).toHaveLength(1);
      expect(result[0].commonName).toBe("VeriSign Root CA");
      expect(result.map(cert => cert.commonName)).not.toContain("DigiCert Root CA");
      expect(result.map(cert => cert.commonName)).not.toContain("GlobalSign Root CA");
    });

    it("should return empty array when include list is empty", () => {
      const config = {
        include: [],
        exclude: [],
      };

      const result = filterPublicCACerts(mockCerts, config);

      expect(result).toHaveLength(0);
    });

    it("should return empty array when no certificates match include list", () => {
      const config = {
        include: [{ commonName: "Non-existent CA", content: "", owner: "" }],
        exclude: [],
      };

      const result = filterPublicCACerts(mockCerts, config);

      expect(result).toHaveLength(0);
    });

    it("should handle empty certificates array", () => {
      const config = {
        include: [{ commonName: "VeriSign Root CA", content: "", owner: "" }],
        exclude: [],
      };

      const result = filterPublicCACerts([], config);

      expect(result).toHaveLength(0);
    });
  });

  describe("extractCertificatesFromPEM", () => {
    it("should extract single certificate with name from PEM content", () => {
      const pemContent = `
VeriSign Class 3 Public Primary Certification Authority - G5
============================================================
-----BEGIN CERTIFICATE-----
MIIE0DCCArigAwIBAgIBBzANBgkqhkiG9w0BAQsFADCBgzELMAkGA1UEBhMCVVMx
EDAOBgNVBAgTB0FyaXpvbmExEzARBgNVBAcTClNjb3R0c2RhbGUxGjAYBgNVBAoT
EUdvRGFkZHkuY29tLCBJbmMuMTEwLwYDVQQDEyhHbyBEYWRkeSBSb290IENlcnRp
ZmljYXRlIEF1dGhvcml0eSAtIEcy
-----END CERTIFICATE-----`.trim();

      const result = extractCertificatesFromPEM(pemContent);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("VeriSign Class 3 Public Primary Certification Authority - G5");
      expect(result[0].content).toContain("-----BEGIN CERTIFICATE-----");
      expect(result[0].content).toContain("-----END CERTIFICATE-----");
    });

    it("should extract multiple certificates from PEM bundle", () => {
      const pemContent = `
First Certificate Authority
===========================
-----BEGIN CERTIFICATE-----
FIRST_CERT_CONTENT_HERE
-----END CERTIFICATE-----

Second Certificate Authority
============================
-----BEGIN CERTIFICATE-----
SECOND_CERT_CONTENT_HERE
-----END CERTIFICATE-----`.trim();

      const result = extractCertificatesFromPEM(pemContent);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("First Certificate Authority");
      expect(result[0].content).toContain("FIRST_CERT_CONTENT_HERE");
      expect(result[1].name).toBe("Second Certificate Authority");
      expect(result[1].content).toContain("SECOND_CERT_CONTENT_HERE");
    });
  });

  describe("inventoryPublicCACertificates", () => {
    it("should validate and create PublicCACert objects from valid certificates", () => {
      const certsWithNames = [
        {
          name: "VeriSign Root CA",
          content: realPEMCert,
        },
        {
          name: "DigiCert Root CA",
          content: realPEMCert,
        },
      ];

      const result = inventoryPublicCACertificates(certsWithNames);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        commonName: "VeriSign Root CA",
        content: expect.stringContaining("-----BEGIN CERTIFICATE-----"),
      });
      expect(result[1]).toMatchObject({
        commonName: "DigiCert Root CA",
        content: expect.stringContaining("-----BEGIN CERTIFICATE-----"),
      });
    });

    it("should throw error for invalid certificate format", () => {
      const certsWithNames = [
        {
          name: "Invalid Cert",
          content: "This is not a valid certificate",
        },
      ];

      expect(() => inventoryPublicCACertificates(certsWithNames)).toThrow(
        "Invalid certificate Invalid Cert",
      );
    });

    it("should handle mixed valid and invalid certificates", () => {
      const certsWithNames = [
        {
          name: "Valid Cert",
          content: realPEMCert,
        },
        {
          name: "Invalid Cert",
          content: "Not a certificate",
        },
      ];

      expect(() => inventoryPublicCACertificates(certsWithNames)).toThrow(
        "Invalid certificate Invalid Cert",
      );
    });

    it("should handle empty input array", () => {
      const result = inventoryPublicCACertificates([]);
      expect(result).toEqual([]);
    });
  });

  describe("enrichCertificatesWithCSVData", () => {
    it("should enrich certificates with exact matches from CSV data", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "VeriSign Root CA",
          content: realPEMCert,
        },
        {
          commonName: "DigiCert Global Root CA",
          content: realPEMCert,
        },
      ];

      const csvRecords = [
        {
          "Common Name or Certificate Name": "VeriSign Root CA",
          "Certificate Issuer Organization": "VeriSign Inc.",
          "Certificate Issuer Organizational Unit":
            "Class 3 Public Primary Certification Authority",
          "Geographic Focus": "US",
          Owner: "VeriSign",
          "Company Website": "https://verisign.com",
        },
        {
          "Common Name or Certificate Name": "DigiCert Global Root CA",
          "Certificate Issuer Organization": "DigiCert Inc.",
          "Certificate Issuer Organizational Unit": "www.digicert.com",
          "Geographic Focus": "Global",
          Owner: "DigiCert",
          "Company Website": "https://digicert.com",
        },
      ];

      const result = enrichCertificatesWithCSVData(certs, csvRecords);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        commonName: "VeriSign Root CA",
        certificateIssuerOrganization: "VeriSign Inc.",
        geographicFocus: "US",
        owner: "VeriSign",
        companyWebsite: "https://verisign.com",
      });
      expect(result[1]).toMatchObject({
        commonName: "DigiCert Global Root CA",
        certificateIssuerOrganization: "DigiCert Inc.",
        geographicFocus: "Global",
        owner: "DigiCert",
        companyWebsite: "https://digicert.com",
      });
    });

    it("should enrich certificates with organizational unit matches", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Some Corporate CA",
          content: realPEMCert,
        },
      ];

      const csvRecords = [
        {
          "Common Name or Certificate Name": "Different Name",
          "Certificate Issuer Organization": "Corporate Inc.",
          "Certificate Issuer Organizational Unit": "Some Corporate CA",
          "Geographic Focus": "EU",
          Owner: "Corporate",
          "Company Website": "https://corporate.com",
        },
      ];

      const result = enrichCertificatesWithCSVData(certs, csvRecords);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        commonName: "Some Corporate CA",
        certificateIssuerOrganization: "Corporate Inc.",
        geographicFocus: "EU",
        owner: "Corporate",
        companyWebsite: "https://corporate.com",
      });
    });

    it("should enrich certificates with case-insensitive matches", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "verisign root ca",
          content: realPEMCert,
        },
      ];

      const csvRecords = [
        {
          "Common Name or Certificate Name": "VeriSign Root CA",
          "Certificate Issuer Organization": "VeriSign Inc.",
          "Certificate Issuer Organizational Unit": "Class 3",
          "Geographic Focus": "US",
          Owner: "VeriSign",
          "Company Website": "https://verisign.com",
        },
      ];

      const result = enrichCertificatesWithCSVData(certs, csvRecords);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        commonName: "verisign root ca",
        certificateIssuerOrganization: "VeriSign Inc.",
        geographicFocus: "US",
        owner: "VeriSign",
        companyWebsite: "https://verisign.com",
      });
    });

    it("should mark certificates as unknown when not found in CSV", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Unknown CA",
          content: realPEMCert,
        },
        {
          commonName: "Another Unknown CA",
          content: realPEMCert,
        },
      ];

      const csvRecords = [
        {
          "Common Name or Certificate Name": "Different CA",
          "Certificate Issuer Organization": "Different Inc.",
          "Certificate Issuer Organizational Unit": "Different Unit",
          "Geographic Focus": "US",
          Owner: "Different",
          "Company Website": "https://different.com",
        },
      ];

      const result = enrichCertificatesWithCSVData(certs, csvRecords);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        commonName: "Unknown CA",
        certificateIssuerOrganization: "unknown - not found in CSV",
        geographicFocus: "unknown - not found in CSV",
        owner: "unknown - not found in CSV",
        companyWebsite: "unknown - not found in CSV",
      });
      expect(result[1]).toMatchObject({
        commonName: "Another Unknown CA",
        certificateIssuerOrganization: "unknown - not found in CSV",
        geographicFocus: "unknown - not found in CSV",
        owner: "unknown - not found in CSV",
        companyWebsite: "unknown - not found in CSV",
      });
    });

    it("should handle empty inputs gracefully", () => {
      expect(enrichCertificatesWithCSVData([], [])).toEqual([]);

      const certs: PublicCACert[] = [
        {
          commonName: "Test CA",
          content: realPEMCert,
        },
      ];

      const result = enrichCertificatesWithCSVData(certs, []);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        commonName: "Test CA",
        certificateIssuerOrganization: "unknown - not found in CSV",
        geographicFocus: "unknown - not found in CSV",
        owner: "unknown - not found in CSV",
        companyWebsite: "unknown - not found in CSV",
      });
    });
  });

  describe("checkForUnaccountedCerts", () => {
    it("should not throw when all certificates are accounted for in include list", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "VeriSign Root CA",
          content: realPEMCert,
        },
        {
          commonName: "DigiCert Root CA",
          content: realPEMCert,
        },
      ];

      const config = {
        include: [
          { commonName: "VeriSign Root CA", content: "", owner: "" },
          { commonName: "DigiCert Root CA", content: "", owner: "" },
        ],
        exclude: [],
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).not.toThrow();
    });

    it("should not throw when all certificates are accounted for in exclude list", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Untrusted CA",
          content: realPEMCert,
        },
        {
          commonName: "Bad CA",
          content: realPEMCert,
        },
      ];

      const config = {
        include: [],
        exclude: [
          { commonName: "Untrusted CA", content: "", owner: "" },
          { commonName: "Bad CA", content: "", owner: "" },
        ],
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).not.toThrow();
    });

    it("should not throw when certificates are split between include and exclude lists", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Trusted CA",
          content: realPEMCert,
        },
        {
          commonName: "Untrusted CA",
          content: realPEMCert,
        },
      ];

      const config = {
        include: [{ commonName: "Trusted CA", content: "", owner: "" }],
        exclude: [{ commonName: "Untrusted CA", content: "", owner: "" }],
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).not.toThrow();
    });

    it("should throw error for unaccounted certificates", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Unknown CA 1",
          content: realPEMCert,
          owner: "Unknown Owner",
          certificateIssuerOrganization: "Unknown Org",
          geographicFocus: "Unknown Location",
          companyWebsite: "https://unknown.com",
        },
        {
          commonName: "Unknown CA 2",
          content: realPEMCert,
        },
      ];

      const config = {
        include: [{ commonName: "Different CA", content: "", owner: "" }],
        exclude: [{ commonName: "Another CA", content: "", owner: "" }],
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).toThrow(
        "Unaccounted certificates found in public CA bundle.",
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "\nError: Found 2 certificates that are not in the include or exclude list:",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "\nYAML entries for copy-paste into your config file:",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith("include:");
      expect(consoleErrorSpy).toHaveBeenCalledWith('  - commonName: "Unknown CA 1"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    owner: "Unknown Owner"');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '    certificateIssuerOrganization: "Unknown Org"',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('    geographicFocus: "Unknown Location"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    companyWebsite: "https://unknown.com"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('  - commonName: "Unknown CA 2"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    owner: "Unknown"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    certificateIssuerOrganization: "Unknown"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    geographicFocus: "Unknown"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    companyWebsite: "Unknown"');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "\nPlease update the configuration file at: /test/config.yaml",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Copy the YAML entries above and add them to either the "include" or "exclude" list.',
      );
    });

    it("should handle certificates with partial metadata gracefully", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Partial CA",
          content: realPEMCert,
          owner: "Some Owner",
          // Missing other optional fields
        },
      ];

      const config = {
        include: [],
        exclude: [],
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).toThrow(
        "Unaccounted certificates found in public CA bundle.",
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith('  - commonName: "Partial CA"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    owner: "Some Owner"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    certificateIssuerOrganization: "Unknown"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    geographicFocus: "Unknown"');
      expect(consoleErrorSpy).toHaveBeenCalledWith('    companyWebsite: "Unknown"');
    });

    it("should handle empty certificate list gracefully", () => {
      const config = {
        include: [{ commonName: "Some CA", content: "", owner: "" }],
        exclude: [],
      };

      expect(() => checkForUnaccountedCerts([], config, "/test/config.yaml")).not.toThrow();
    });

    it("should handle empty config gracefully", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Test CA",
          content: realPEMCert,
        },
      ];

      const config = {
        include: [],
        exclude: [],
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).toThrow(
        "Unaccounted certificates found in public CA bundle.",
      );
    });

    it("should handle undefined config arrays", () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Test CA",
          content: realPEMCert,
        },
      ];

      const config = {
        include: undefined as PublicCACert[] | undefined,
        exclude: undefined as PublicCACert[] | undefined,
      };

      expect(() => checkForUnaccountedCerts(certs, config, "/test/config.yaml")).toThrow(
        "Unaccounted certificates found in public CA bundle.",
      );
    });
  });

  describe("readPublicCATrustConfig", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "config-test-"));
    });

    afterEach(async () => {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should read and parse valid YAML config file", async () => {
      const configContent = `
include:
  - commonName: "VeriSign Root CA"
    owner: "VeriSign"
    certificateIssuerOrganization: "VeriSign Inc."
    geographicFocus: "USA, Global"
    companyWebsite: "https://verisign.com"
  - commonName: "DigiCert Root CA"
    owner: "DigiCert"
    certificateIssuerOrganization: "DigiCert Inc"
    geographicFocus: "USA, Global" 
    companyWebsite: "https://digicert.com"
exclude:
  - commonName: "Bad CA"
    owner: "BadCorp"
    certificateIssuerOrganization: "Bad Corp Inc"
    geographicFocus: "Unknown"
    companyWebsite: "https://badcorp.com"
`;
      const configPath = path.join(tempDir, "config.yaml");
      await fs.promises.writeFile(configPath, configContent);

      const result = await readPublicCATrustConfig(configPath);

      expect(result.include).toHaveLength(2);
      expect(result.exclude).toHaveLength(1);
      expect(result.include[0]).toMatchObject({
        commonName: "VeriSign Root CA",
        owner: "VeriSign",
        certificateIssuerOrganization: "VeriSign Inc.",
        geographicFocus: "USA, Global",
        companyWebsite: "https://verisign.com",
      });
      expect(result.include[1]).toMatchObject({
        commonName: "DigiCert Root CA",
        owner: "DigiCert",
        certificateIssuerOrganization: "DigiCert Inc",
        geographicFocus: "USA, Global",
        companyWebsite: "https://digicert.com",
      });
      expect(result.exclude[0]).toMatchObject({
        commonName: "Bad CA",
        owner: "BadCorp",
        certificateIssuerOrganization: "Bad Corp Inc",
        geographicFocus: "Unknown",
        companyWebsite: "https://badcorp.com",
      });
    });

    it("should handle empty config file", async () => {
      const configContent = ``;
      const configPath = path.join(tempDir, "config.yaml");
      await fs.promises.writeFile(configPath, configContent);

      const result = await readPublicCATrustConfig(configPath);

      expect(result.include).toHaveLength(0);
      expect(result.exclude).toHaveLength(0);
    });

    it("should handle config with malformed arrays", async () => {
      const configContent = `
include: "not an array"
exclude: 123
`;
      const configPath = path.join(tempDir, "config.yaml");
      await fs.promises.writeFile(configPath, configContent);

      const result = await readPublicCATrustConfig(configPath);

      expect(result.include).toHaveLength(0);
      expect(result.exclude).toHaveLength(0);
    });

    it("should return default config when file does not exist", async () => {
      const nonExistentPath = path.join(tempDir, "nonexistent.yaml");

      const result = await readPublicCATrustConfig(nonExistentPath);

      expect(result.include).toHaveLength(0);
      expect(result.exclude).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Could not read trust config"),
      );
    });
  });

  describe("writePublicCABundle", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bundle-test-"));
    });

    afterEach(async () => {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should write certificates to PEM bundle with proper formatting", async () => {
      const certs: PublicCACert[] = [
        {
          commonName: "VeriSign Root CA",
          content: realPEMCert,
        },
        {
          commonName: "DigiCert Root CA",
          content: realPEMCert,
        },
      ];

      await writePublicCABundle(certs, tempDir);

      const bundlePath = path.join(tempDir, "public", "ca-bundle.pem");
      expect(fs.existsSync(bundlePath)).toBe(true);

      const bundleContent = await fs.promises.readFile(bundlePath, "utf8");

      // Check that certificate names are used as headers
      expect(bundleContent).toContain("VeriSign Root CA");
      expect(bundleContent).toContain("DigiCert Root CA");

      // Check that separator lines are present
      expect(bundleContent).toContain("=".repeat("VeriSign Root CA".length));
      expect(bundleContent).toContain("=".repeat("DigiCert Root CA".length));

      // Check that certificate content is present
      expect(bundleContent).toContain("-----BEGIN CERTIFICATE-----");
      expect(bundleContent).toContain("-----END CERTIFICATE-----");

      // Should contain both certificates
      const certBlocks = bundleContent.match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
      );
      expect(certBlocks).toHaveLength(2);
    });

    it("should handle single certificate", async () => {
      const certs: PublicCACert[] = [
        {
          commonName: "Single Test CA",
          content: realPEMCert,
        },
      ];

      await writePublicCABundle(certs, tempDir);

      const bundlePath = path.join(tempDir, "public", "ca-bundle.pem");
      const bundleContent = await fs.promises.readFile(bundlePath, "utf8");

      expect(bundleContent).toContain("Single Test CA");
      expect(bundleContent).toContain("=".repeat("Single Test CA".length));
      expect(bundleContent).toContain("-----BEGIN CERTIFICATE-----");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Wrote 1 trusted CA certificates to:"),
      );
    });
  });

  describe("readExistingPublicCABundle", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "read-bundle-test-"));
    });

    afterEach(async () => {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should read and parse existing bundle file", async () => {
      // Create public directory and bundle file manually
      const publicDir = path.join(tempDir, "public");
      await fs.promises.mkdir(publicDir, { recursive: true });

      const bundlePath = path.join(publicDir, "ca-bundle.pem");
      const bundleContent = `Test CA 1
=========
${realPEMCert}

Test CA 2
=========
${realPEMCert}
`;
      await fs.promises.writeFile(bundlePath, bundleContent);

      const result = await readExistingPublicCABundle(tempDir);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        commonName: "Test CA 1",
        content: expect.stringContaining("-----BEGIN CERTIFICATE-----"),
      });
      expect(result[1]).toMatchObject({
        commonName: "Test CA 2",
        content: expect.stringContaining("-----BEGIN CERTIFICATE-----"),
      });
    });

    it("should throw error when bundle file doesn't exist", async () => {
      await expect(readExistingPublicCABundle(tempDir)).rejects.toThrow(
        "Failed to read existing public CA bundle",
      );
    });

    it("should throw error for invalid PEM format", async () => {
      // Create public directory and invalid bundle file
      const publicDir = path.join(tempDir, "public");
      await fs.promises.mkdir(publicDir, { recursive: true });

      const bundlePath = path.join(publicDir, "ca-bundle.pem");
      const invalidContent = `Invalid Certificate
=====================
-----BEGIN CERTIFICATE-----
InvalidCertificateData
-----END CERTIFICATE-----`;

      await fs.promises.writeFile(bundlePath, invalidContent);

      await expect(readExistingPublicCABundle(tempDir)).rejects.toThrow(
        "Failed to read existing public CA bundle",
      );
    });
  });
});
