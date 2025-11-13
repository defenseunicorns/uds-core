/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import * as dod_certs from "./dod-certs";

describe("dod-certs", () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  // Real DER certificate
  const realDERCert = Buffer.from(
    "MIIE1zCCA7+gAwIBAgIERIEHejANBgkqhkiG9w0BAQsFADBuMQswCQYDVQQGEwJVUzEQMA4GA1UEChMHRW50cnVzdDEiMCAGA1UECxMZQ2VydGlmaWNhdGlvbiBBdXRob3JpdGllczEpMCcGA1UECxMgRW50cnVzdCBNYW5hZ2VkIFNlcnZpY2VzIFJvb3QgQ0EwHhcNMTkwODEzMTM1MDM4WhcNMjkwODEzMTQyMDM4WjBuMQswCQYDVQQGEwJVUzEQMA4GA1UEChMHRW50cnVzdDEiMCAGA1UECxMZQ2VydGlmaWNhdGlvbiBBdXRob3JpdGllczEpMCcGA1UECxMgRW50cnVzdCBNYW5hZ2VkIFNlcnZpY2VzIFJvb3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDnvaBqgVvvj6CwJ4yuWifd2/mmMsnJTicI7RCqJKHNcrxmqDA1rjvP4p0XfDWh95HFiy7SqD/qDOVBTmzUNuUbwJ42xdejCNpjAMAyiwNJHgeuwu22vUL/jHEuQp6NfgZDTWSlMdYx6O2mKgYwfcWqAr4T0ZruEZT2uDLQJ5Uzb8ugnd6S3frF2md0IRtR973JAiWIQgJslsqHFwx5skoA5vqDyPKvQLN4pecOrBUxQSfhEQOxXFCATOZAyvJZ2v8sFlyRLjQAQSFzgPWiO2ywAG8qtv03OkadII9IMVcVjw3kL74KYDY6Flpk4eD/+nzk8TFvgBUGbJlx4hrLXB7NAgMBAAGjggF7MIIBdzBfBggrBgEFBQcBCwRTMFEwTwYIKwYBBQUHMAWGQ2h0dHA6Ly9yb290d2ViLm1hbmFnZWQuZW50cnVzdC5jb20vU0lBL0NBY2VydHNJc3N1ZWRCeUVNU1Jvb3RDQS5wN2MwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAYYwgdMGA1UdHwSByzCByDA8oDqgOIY2aHR0cDovL3Jvb3R3ZWIubWFuYWdlZC5lbnRydXN0LmNvbS9DUkxzL0VNU1Jvb3RDQTMuY3JsMIGHoIGEoIGBpH8wfTELMAkGA1UEBhMCVVMxEDAOBgNVBAoTB0VudHJ1c3QxIjAgBgNVBAsTGUNlcnRpZmljYXRpb24gQXV0aG9yaXRpZXMxKTAnBgNVBAsTIEVudHJ1c3QgTWFuYWdlZCBTZXJ2aWNlcyBSb290IENBMQ0wCwYDVQQDEwRDUkwxMB0GA1UdDgQWBBRJVJFMaUQ7xPgCLPT4LTNWiXWYEDANBgkqhkiG9w0BAQsFAAOCAQEAffgN0+kDAHMFnNkEFPJdXHYojaAwjvsyb4rFUXhOv/QPl0lOSUevqJpPyFsVutEM4Jk6NU68FjZv8EWDvWrUw2VtxI7/fVlu18SDXcpsvvnFSnGxIsJLYce5Jnwmox/E0eaZnqEXwGoVXglvjXY3dEL08BgVwQcMd3fx5ldj11nQ+p07PQ6EZrg/xxwsDM/vjI2Wd7eDV1PN10UDJS7T24sWCK8gNk8Fh2588LSU+B1HVHtA7Js2kNJronU1X0S09lNLJ38LRRhQ4IXiLlTaC9rr3S0fgWY6jRJq6riIfZN0ywR0wTzXZqBJLcW4Vnav8k8bjlYxEL4A3Umr1mHSoA==",
    "base64",
  );

  // Real PEM certificate
  const realPEMCert = `-----BEGIN CERTIFICATE-----
MIIFtzCCA5+gAwIBAgICBQkwDQYJKoZIhvcNAQEFBQAwRTELMAkGA1UEBhMCQk0xGTAXBgNVBAoT
EFF1b1ZhZGlzIExpbWl0ZWQxGzAZBgNVBAMTElF1b1ZhZGlzIFJvb3QgQ0EgMjAeFw0wNjExMjQx
ODI3MDBaFw0zMTExMjQxODIzMzNaMEUxCzAJBgNVBAYTAkJNMRkwFwYDVQQKExBRdW9WYWRpcyBM
aW1pdGVkMRswGQYDVQQDExJRdW9WYWRpcyBSb290IENBIDIwggIiMA0GCSqGSIb3DQEBAQUAA4IC
DwAwggIKAoICAQCaGMpLlA0ALa8DKYrwD4HIrkwZhR0In6spRIXzL4GtMh6QRr+jhiYaHv5+HBg6
XJxgFyo6dIMzMH1hVBHL7avg5tKifvVrbxi3Cgst/ek+7wrGsxDp3MJGF/hd/aTa/55JWpzmM+Yk
lvc/ulsrHHo1wtZn/qtmUIttKGAr79dgw8eTvI02kfN/+NsRE8Scd3bBrrcCaoF6qUWD4gXmuVbB
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
    // Mock console.log and console.error to prevent output during tests
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("diffDoDCerts", () => {
    it("should detect no differences when certificates are identical", () => {
      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/test/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
        {
          filepath: "/test/certs/dod/v1.1/DigiCert",
          filename: "cert2.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert2\n-----END CERTIFICATE-----",
          organization: "DigiCert",
        },
      ];

      const downloaded: dod_certs.DoDCert[] = [
        {
          filepath: "/tmp/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
        {
          filepath: "/tmp/certs/dod/v1.1/DigiCert",
          filename: "cert2.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert2\n-----END CERTIFICATE-----",
          organization: "DigiCert",
        },
      ];

      const result = dod_certs.diffDoDCerts(existing, downloaded);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it("should detect added certificates", () => {
      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/test/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const downloaded: dod_certs.DoDCert[] = [
        {
          filepath: "/tmp/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
        {
          filepath: "/tmp/certs/dod/v1.1/DigiCert",
          filename: "cert2.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert2\n-----END CERTIFICATE-----",
          organization: "DigiCert",
        },
      ];

      const result = dod_certs.diffDoDCerts(existing, downloaded);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].filename).toBe("cert2.cer");
      expect(result.added[0].organization).toBe("DigiCert");
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it("should detect removed certificates", () => {
      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/test/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
        {
          filepath: "/test/certs/dod/v1.1/DigiCert",
          filename: "cert2.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert2\n-----END CERTIFICATE-----",
          organization: "DigiCert",
        },
      ];

      const downloaded: dod_certs.DoDCert[] = [
        {
          filepath: "/tmp/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const result = dod_certs.diffDoDCerts(existing, downloaded);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].filename).toBe("cert2.cer");
      expect(result.removed[0].organization).toBe("DigiCert");
      expect(result.modified).toHaveLength(0);
    });

    it("should detect modified certificates", () => {
      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/test/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1_old\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const downloaded: dod_certs.DoDCert[] = [
        {
          filepath: "/tmp/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1_new\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const result = dod_certs.diffDoDCerts(existing, downloaded);

      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].old.content).toContain("cert1_old");
      expect(result.modified[0].new.content).toContain("cert1_new");
    });

    it("should handle complex scenarios with multiple changes", () => {
      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/test/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
        {
          filepath: "/test/certs/dod/v1.1/DigiCert",
          filename: "cert2.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert2_old\n-----END CERTIFICATE-----",
          organization: "DigiCert",
        },
        {
          filepath: "/test/certs/dod/v1.1/VeriSign",
          filename: "cert3.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert3\n-----END CERTIFICATE-----",
          organization: "VeriSign",
        },
      ];

      const downloaded: dod_certs.DoDCert[] = [
        {
          filepath: "/tmp/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
        {
          filepath: "/tmp/certs/dod/v1.1/DigiCert",
          filename: "cert2.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert2_new\n-----END CERTIFICATE-----",
          organization: "DigiCert",
        },
        {
          filepath: "/tmp/certs/dod/v1.1/GlobalSign",
          filename: "cert4.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert4\n-----END CERTIFICATE-----",
          organization: "GlobalSign",
        },
      ];

      const result = dod_certs.diffDoDCerts(existing, downloaded);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].organization).toBe("GlobalSign");
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].organization).toBe("VeriSign");
      expect(result.modified).toHaveLength(1);
      expect(result.modified[0].new.organization).toBe("DigiCert");
    });

    it("should handle certificates with different path formats", () => {
      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/some/different/path/certs/dod/v1.2/Entrust/Trust_Chain_1",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const downloaded: dod_certs.DoDCert[] = [
        {
          filepath: "/completely/different/base/certs/dod/v1.2/Entrust/Trust_Chain_1",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const result = dod_certs.diffDoDCerts(existing, downloaded);

      // Should recognize as the same certificate despite different base paths
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
    });

    it("should handle empty arrays gracefully", () => {
      const result1 = dod_certs.diffDoDCerts([], []);
      expect(result1.added).toHaveLength(0);
      expect(result1.removed).toHaveLength(0);
      expect(result1.modified).toHaveLength(0);

      const existing: dod_certs.DoDCert[] = [
        {
          filepath: "/test/certs/dod/v1.1/Entrust",
          filename: "cert1.cer",
          content: "-----BEGIN CERTIFICATE-----\nMIIB...cert1\n-----END CERTIFICATE-----",
          organization: "Entrust",
        },
      ];

      const result2 = dod_certs.diffDoDCerts(existing, []);
      expect(result2.added).toHaveLength(0);
      expect(result2.removed).toHaveLength(1);
      expect(result2.modified).toHaveLength(0);

      const result3 = dod_certs.diffDoDCerts([], existing);
      expect(result3.added).toHaveLength(1);
      expect(result3.removed).toHaveLength(0);
      expect(result3.modified).toHaveLength(0);
    });
  });

  describe("inventoryDoDCertificates", () => {
    let tempDir: string;

    beforeEach(async () => {
      // Create a real temporary directory
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dod-test-"));
    });

    afterEach(async () => {
      // Clean up temp directory
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it("should throw error for invalid certificate data", async () => {
      // Create test directory structure: tempDir/test-dod/v1.1/Entrust/cert.cer
      const testDodDir = path.join(tempDir, "test-dod");
      const versionDir = path.join(testDodDir, "v1.1");
      const entrustDir = path.join(versionDir, "Entrust");

      const badCertData = "blahhh, not a real cert";

      await fs.promises.mkdir(entrustDir, { recursive: true });

      // Create a mock certificate file with invalid data
      await fs.promises.writeFile(path.join(entrustDir, "test-cert.cer"), badCertData);

      await expect(dod_certs.inventoryDoDCertificates(tempDir, "test-dod")).rejects.toThrow(
        "Invalid certificate test-cert.cer",
      );
    });

    it("should handle multiple organizations and certificates", async () => {
      // Create test directory structure with multiple orgs
      const testDodDir = path.join(tempDir, "test-dod");
      const versionDir = path.join(testDodDir, "v1.1");
      const entrustDir = path.join(versionDir, "Entrust");
      const digicertDir = path.join(versionDir, "DigiCert");

      await fs.promises.mkdir(entrustDir, { recursive: true });
      await fs.promises.mkdir(digicertDir, { recursive: true });

      // Create certificate files
      await fs.promises.writeFile(path.join(entrustDir, "entrust1.cer"), realDERCert);
      await fs.promises.writeFile(path.join(entrustDir, "entrust2.cer"), realDERCert);
      await fs.promises.writeFile(path.join(digicertDir, "digicert1.cer"), realDERCert);

      const result = await dod_certs.inventoryDoDCertificates(tempDir, "test-dod");

      expect(result).toHaveLength(3);

      const entrustCerts = result.filter(cert => cert.organization === "Entrust");
      const digicertCerts = result.filter(cert => cert.organization === "DigiCert");

      expect(entrustCerts).toHaveLength(2);
      expect(digicertCerts).toHaveLength(1);
    });

    it("should skip non-.cer files", async () => {
      const testDodDir = path.join(tempDir, "test-dod");
      const versionDir = path.join(testDodDir, "v1.1");
      const entrustDir = path.join(versionDir, "Entrust");

      await fs.promises.mkdir(entrustDir, { recursive: true });

      // Create various files
      await fs.promises.writeFile(path.join(entrustDir, "cert.cer"), realDERCert);
      await fs.promises.writeFile(path.join(entrustDir, "readme.txt"), "Some text");
      await fs.promises.writeFile(path.join(entrustDir, "cert.pem"), "PEM content");
      await fs.promises.writeFile(path.join(entrustDir, "cert2.CER"), realPEMCert); // uppercase

      const result = await dod_certs.inventoryDoDCertificates(tempDir, "test-dod");

      expect(result).toHaveLength(2); // Only .cer and .CER files
      expect(result.every(cert => cert.filename.toLowerCase().endsWith(".cer"))).toBe(true);
    });

    it("should handle nested directory structures", async () => {
      const testDodDir = path.join(tempDir, "test-dod");
      const versionDir = path.join(testDodDir, "v1.1");
      const entrustDir = path.join(versionDir, "Entrust");
      const trustChainDir = path.join(entrustDir, "Trust_Chain_1");

      await fs.promises.mkdir(trustChainDir, { recursive: true });

      await fs.promises.writeFile(path.join(trustChainDir, "root-ca.cer"), realDERCert);

      const result = await dod_certs.inventoryDoDCertificates(tempDir, "test-dod");

      expect(result).toHaveLength(1);
      expect(result[0].organization).toBe("Entrust");
      expect(result[0].filepath).toBe(trustChainDir);
    });
  });
});
