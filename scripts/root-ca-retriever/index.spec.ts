/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { handleDoDCerts, handlePublicCerts, updateConfigMapWithCerts } from "./index";
import { DoDCert } from "./dod-certs";
import { PublicCACert } from "./public-certs";

// Mock the dod-certs module
vi.mock("./dod-certs", () => ({
  retrieveDoDCertificates: vi.fn(),
  inventoryDoDCertificates: vi.fn(),
  diffDoDCerts: vi.fn(),
}));

// Mock the public-certs module
vi.mock("./public-certs", () => ({
  retrievePublicCACertificates: vi.fn(),
  downloadMozillaCSVData: vi.fn(),
  extractCertificatesFromPEM: vi.fn(),
  inventoryPublicCACertificates: vi.fn(),
  enrichCertificatesWithCSVData: vi.fn(),
  readPublicCATrustConfig: vi.fn(),
  checkForUnaccountedCerts: vi.fn(),
  filterPublicCACerts: vi.fn(),
  writePublicCABundle: vi.fn(),
  readExistingPublicCABundle: vi.fn(),
  diffPublicCACerts: vi.fn(),
}));

// Mock fs module
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

describe("index", () => {
  let consoleLogSpy: MockInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "index-test-"));
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("handleDoDCerts", () => {
    it("should handle check mode with differences detected", async () => {
      const { retrieveDoDCertificates, inventoryDoDCertificates, diffDoDCerts } = await import(
        "./dod-certs"
      );

      vi.mocked(retrieveDoDCertificates).mockResolvedValue();
      vi.mocked(inventoryDoDCertificates)
        .mockResolvedValueOnce([
          {
            filepath: "/tmp/certs/dod/v1.1/Entrust",
            filename: "test.cer",
            content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
            organization: "Entrust",
          },
        ])
        .mockResolvedValueOnce([]); // existing certs (empty)

      vi.mocked(diffDoDCerts).mockReturnValue({
        added: [
          {
            filepath: "/tmp/certs/dod/v1.1/Entrust",
            filename: "test.cer",
            content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
            organization: "Entrust",
          },
        ],
        removed: [],
        modified: [],
      });

      await expect(handleDoDCerts(true, tempDir)).rejects.toThrow(
        "Differences detected in DoD certificates",
      );
    });

    it("should handle check mode with no differences", async () => {
      const { retrieveDoDCertificates, inventoryDoDCertificates, diffDoDCerts } = await import(
        "./dod-certs"
      );

      const mockCert = {
        filepath: "/tmp/certs/dod/v1.1/Entrust",
        filename: "test.cer",
        content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
        organization: "Entrust",
      };

      vi.mocked(retrieveDoDCertificates).mockResolvedValue();
      vi.mocked(inventoryDoDCertificates)
        .mockResolvedValueOnce([mockCert])
        .mockResolvedValueOnce([mockCert]); // same certs

      vi.mocked(diffDoDCerts).mockReturnValue({
        added: [],
        removed: [],
        modified: [],
      });

      const result = await handleDoDCerts(true, tempDir);

      expect(result).toEqual([mockCert]);
      expect(consoleLogSpy).toHaveBeenCalledWith("No differences detected in DoD certificates.");
    });

    it("should handle check mode with only removed certificates", async () => {
      const { retrieveDoDCertificates, inventoryDoDCertificates, diffDoDCerts } = await import(
        "./dod-certs"
      );

      const removedCert = {
        filepath: "/tmp/certs/dod/v1.1/Entrust",
        filename: "removed.cer",
        content: "-----BEGIN CERTIFICATE-----\nremoved\n-----END CERTIFICATE-----",
        organization: "Entrust",
      };

      vi.mocked(retrieveDoDCertificates).mockResolvedValue();
      vi.mocked(inventoryDoDCertificates)
        .mockResolvedValueOnce([]) // new certs (empty)
        .mockResolvedValueOnce([removedCert]); // existing certs

      vi.mocked(diffDoDCerts).mockReturnValue({
        added: [],
        removed: [removedCert],
        modified: [],
      });

      await expect(handleDoDCerts(true, tempDir)).rejects.toThrow(
        "Differences detected in DoD certificates",
      );
    });

    it("should handle check mode with only modified certificates", async () => {
      const { retrieveDoDCertificates, inventoryDoDCertificates, diffDoDCerts } = await import(
        "./dod-certs"
      );

      const oldCert = {
        filepath: "/tmp/certs/dod/v1.1/Entrust",
        filename: "modified.cer",
        content: "-----BEGIN CERTIFICATE-----\nold\n-----END CERTIFICATE-----",
        organization: "Entrust",
      };

      const newCert = {
        filepath: "/tmp/certs/dod/v1.1/Entrust",
        filename: "modified.cer",
        content: "-----BEGIN CERTIFICATE-----\nnew\n-----END CERTIFICATE-----",
        organization: "Entrust",
      };

      vi.mocked(retrieveDoDCertificates).mockResolvedValue();
      vi.mocked(inventoryDoDCertificates)
        .mockResolvedValueOnce([newCert]) // new certs
        .mockResolvedValueOnce([oldCert]); // existing certs

      vi.mocked(diffDoDCerts).mockReturnValue({
        added: [],
        removed: [],
        modified: [{ old: oldCert, new: newCert }],
      });

      await expect(handleDoDCerts(true, tempDir)).rejects.toThrow(
        "Differences detected in DoD certificates",
      );
    });

    it("should handle normal mode successfully", async () => {
      const { retrieveDoDCertificates, inventoryDoDCertificates } = await import("./dod-certs");

      const mockCert = {
        filepath: "/tmp/certs/dod/v1.1/Entrust",
        filename: "test.cer",
        content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
        organization: "Entrust",
      };

      vi.mocked(retrieveDoDCertificates).mockResolvedValue();
      vi.mocked(inventoryDoDCertificates).mockResolvedValue([mockCert]);

      // Set up fs mocks for cleanup
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rmSync).mockImplementation(() => {});

      const result = await handleDoDCerts(false, tempDir);

      expect(result).toEqual([mockCert]);
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalled();
    });
  });

  describe("handlePublicCerts", () => {
    it("should handle check mode with differences detected", async () => {
      const publicCerts = await import("./public-certs");

      const mockCert = {
        commonName: "Test CA",
        content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
        owner: "Test Owner",
        certificateIssuerOrganization: "Test Org",
        geographicFocus: "US",
        companyWebsite: "https://test.com",
      };

      vi.mocked(publicCerts.retrievePublicCACertificates).mockResolvedValue("test content");
      vi.mocked(publicCerts.downloadMozillaCSVData).mockResolvedValue([]);
      vi.mocked(publicCerts.extractCertificatesFromPEM).mockReturnValue([
        { name: "Test CA", content: "test" },
      ]);
      vi.mocked(publicCerts.inventoryPublicCACertificates).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.enrichCertificatesWithCSVData).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.readPublicCATrustConfig).mockResolvedValue({
        include: [mockCert],
        exclude: [],
      });
      vi.mocked(publicCerts.checkForUnaccountedCerts).mockImplementation(() => {});
      vi.mocked(publicCerts.filterPublicCACerts).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.writePublicCABundle).mockResolvedValue();
      vi.mocked(publicCerts.readExistingPublicCABundle).mockResolvedValue([]);
      vi.mocked(publicCerts.diffPublicCACerts).mockReturnValue({
        added: [mockCert],
        removed: [],
        modified: [],
      });

      await expect(handlePublicCerts(true, tempDir)).rejects.toThrow(
        "Differences detected in public CA certificates",
      );
    });

    it("should handle check mode with no differences", async () => {
      const publicCerts = await import("./public-certs");

      const mockCert = {
        commonName: "Test CA",
        content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
        owner: "Test Owner",
        certificateIssuerOrganization: "Test Org",
        geographicFocus: "US",
        companyWebsite: "https://test.com",
      };

      vi.mocked(publicCerts.retrievePublicCACertificates).mockResolvedValue("test content");
      vi.mocked(publicCerts.downloadMozillaCSVData).mockResolvedValue([]);
      vi.mocked(publicCerts.extractCertificatesFromPEM).mockReturnValue([
        { name: "Test CA", content: "test" },
      ]);
      vi.mocked(publicCerts.inventoryPublicCACertificates).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.enrichCertificatesWithCSVData).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.readPublicCATrustConfig).mockResolvedValue({
        include: [mockCert],
        exclude: [],
      });
      vi.mocked(publicCerts.checkForUnaccountedCerts).mockImplementation(() => {});
      vi.mocked(publicCerts.filterPublicCACerts).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.writePublicCABundle).mockResolvedValue();
      vi.mocked(publicCerts.readExistingPublicCABundle).mockResolvedValue([mockCert]);
      vi.mocked(publicCerts.diffPublicCACerts).mockReturnValue({
        added: [],
        removed: [],
        modified: [],
      });

      const result = await handlePublicCerts(true, tempDir);

      expect(result).toEqual([mockCert]);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "No differences detected in public CA certificates.",
      );
    });

    it("should handle check mode with only removed certificates", async () => {
      const publicCerts = await import("./public-certs");

      const removedCert = {
        commonName: "Removed CA",
        content: "-----BEGIN CERTIFICATE-----\nremoved\n-----END CERTIFICATE-----",
        owner: "Removed Owner",
        certificateIssuerOrganization: "Removed Org",
        geographicFocus: "US",
        companyWebsite: "https://removed.com",
      };

      vi.mocked(publicCerts.retrievePublicCACertificates).mockResolvedValue("test content");
      vi.mocked(publicCerts.downloadMozillaCSVData).mockResolvedValue([]);
      vi.mocked(publicCerts.extractCertificatesFromPEM).mockReturnValue([]);
      vi.mocked(publicCerts.inventoryPublicCACertificates).mockReturnValue([]);
      vi.mocked(publicCerts.enrichCertificatesWithCSVData).mockReturnValue([]);
      vi.mocked(publicCerts.readPublicCATrustConfig).mockResolvedValue({
        include: [],
        exclude: [],
      });
      vi.mocked(publicCerts.checkForUnaccountedCerts).mockImplementation(() => {});
      vi.mocked(publicCerts.filterPublicCACerts).mockReturnValue([]);
      vi.mocked(publicCerts.writePublicCABundle).mockResolvedValue();
      vi.mocked(publicCerts.readExistingPublicCABundle).mockResolvedValue([removedCert]);
      vi.mocked(publicCerts.diffPublicCACerts).mockReturnValue({
        added: [],
        removed: [removedCert],
        modified: [],
      });

      await expect(handlePublicCerts(true, tempDir)).rejects.toThrow(
        "Differences detected in public CA certificates",
      );
    });

    it("should handle check mode with only modified certificates", async () => {
      const publicCerts = await import("./public-certs");

      const oldCert = {
        commonName: "Modified CA",
        content: "-----BEGIN CERTIFICATE-----\nold\n-----END CERTIFICATE-----",
        owner: "Old Owner",
        certificateIssuerOrganization: "Old Org",
        geographicFocus: "US",
        companyWebsite: "https://old.com",
      };

      const newCert = {
        commonName: "Modified CA",
        content: "-----BEGIN CERTIFICATE-----\nnew\n-----END CERTIFICATE-----",
        owner: "New Owner",
        certificateIssuerOrganization: "New Org",
        geographicFocus: "US",
        companyWebsite: "https://new.com",
      };

      vi.mocked(publicCerts.retrievePublicCACertificates).mockResolvedValue("test content");
      vi.mocked(publicCerts.downloadMozillaCSVData).mockResolvedValue([]);
      vi.mocked(publicCerts.extractCertificatesFromPEM).mockReturnValue([
        { name: "Modified CA", content: "new" },
      ]);
      vi.mocked(publicCerts.inventoryPublicCACertificates).mockReturnValue([newCert]);
      vi.mocked(publicCerts.enrichCertificatesWithCSVData).mockReturnValue([newCert]);
      vi.mocked(publicCerts.readPublicCATrustConfig).mockResolvedValue({
        include: [newCert],
        exclude: [],
      });
      vi.mocked(publicCerts.checkForUnaccountedCerts).mockImplementation(() => {});
      vi.mocked(publicCerts.filterPublicCACerts).mockReturnValue([newCert]);
      vi.mocked(publicCerts.writePublicCABundle).mockResolvedValue();
      vi.mocked(publicCerts.readExistingPublicCABundle).mockResolvedValue([oldCert]);
      vi.mocked(publicCerts.diffPublicCACerts).mockReturnValue({
        added: [],
        removed: [],
        modified: [{ old: oldCert, new: newCert }],
      });

      await expect(handlePublicCerts(true, tempDir)).rejects.toThrow(
        "Differences detected in public CA certificates",
      );
    });

    it("should handle normal mode successfully", async () => {
      const publicCerts = await import("./public-certs");

      const mockCert = {
        commonName: "Test CA",
        content: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
        owner: "Test Owner",
        certificateIssuerOrganization: "Test Org",
        geographicFocus: "US",
        companyWebsite: "https://test.com",
      };

      vi.mocked(publicCerts.retrievePublicCACertificates).mockResolvedValue("test content");
      vi.mocked(publicCerts.downloadMozillaCSVData).mockResolvedValue([]);
      vi.mocked(publicCerts.extractCertificatesFromPEM).mockReturnValue([
        { name: "Test CA", content: "test" },
      ]);
      vi.mocked(publicCerts.inventoryPublicCACertificates).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.enrichCertificatesWithCSVData).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.readPublicCATrustConfig).mockResolvedValue({
        include: [mockCert],
        exclude: [],
      });
      vi.mocked(publicCerts.checkForUnaccountedCerts).mockImplementation(() => {});
      vi.mocked(publicCerts.filterPublicCACerts).mockReturnValue([mockCert]);
      vi.mocked(publicCerts.writePublicCABundle).mockResolvedValue();

      const result = await handlePublicCerts(false, tempDir);

      expect(result).toEqual([mockCert]);
      expect(publicCerts.writePublicCABundle).toHaveBeenCalledWith([mockCert], tempDir);
    });
  });

  describe("updateConfigMapWithCerts", () => {
    it("should convert certificates to base64", () => {
      // Test the base64 encoding logic separately since the full function has hardcoded paths
      const dodCerts = [
        {
          filepath: "/test/dod",
          filename: "test1.cer",
          content: "-----BEGIN CERTIFICATE-----\nDoDCert1\n-----END CERTIFICATE-----",
          organization: "TestOrg1",
        },
        {
          filepath: "/test/dod",
          filename: "test2.cer",
          content: "-----BEGIN CERTIFICATE-----\nDoDCert2\n-----END CERTIFICATE-----",
          organization: "TestOrg2",
        },
      ];

      const publicCerts = [
        {
          commonName: "Test Public CA 1",
          content: "-----BEGIN CERTIFICATE-----\nPublicCert1\n-----END CERTIFICATE-----",
        },
      ];

      // Test the base64 encoding logic manually
      const allDoDCertContents = dodCerts.map(cert => cert.content.trim()).join("\n");
      const dodBase64Blob = Buffer.from(allDoDCertContents, "utf8").toString("base64");

      const allPublicCertContents = publicCerts.map(cert => cert.content.trim()).join("\n");
      const publicBase64Blob = Buffer.from(allPublicCertContents, "utf8").toString("base64");

      // Verify base64 encoding works
      expect(dodBase64Blob).toBeTruthy();
      expect(publicBase64Blob).toBeTruthy();

      // Verify we can decode back to original content
      const decodedDoD = Buffer.from(dodBase64Blob, "base64").toString("utf8");
      const decodedPublic = Buffer.from(publicBase64Blob, "base64").toString("utf8");

      expect(decodedDoD).toContain("DoDCert1");
      expect(decodedDoD).toContain("DoDCert2");
      expect(decodedPublic).toContain("PublicCert1");
    });

    it("should handle empty certificate arrays for base64 encoding", () => {
      const dodCerts: DoDCert[] = [];
      const publicCerts: PublicCACert[] = [];

      // Test empty array handling
      const allDoDCertContents = dodCerts.map(cert => cert.content.trim()).join("\n");
      const dodBase64Blob = Buffer.from(allDoDCertContents, "utf8").toString("base64");

      const allPublicCertContents = publicCerts.map(cert => cert.content.trim()).join("\n");
      const publicBase64Blob = Buffer.from(allPublicCertContents, "utf8").toString("base64");

      // Empty string base64 should be empty
      expect(dodBase64Blob).toBe("");
      expect(publicBase64Blob).toBe("");
    });

    it("should read, parse, update and write ConfigMap YAML correctly", async () => {
      const dodCerts: DoDCert[] = [
        {
          filepath: "/test/dod",
          filename: "test1.cer",
          content: "-----BEGIN CERTIFICATE-----\nDoDCert1\n-----END CERTIFICATE-----",
          organization: "TestOrg1",
        },
      ];

      const publicCerts: PublicCACert[] = [
        {
          commonName: "Test Public CA",
          content: "-----BEGIN CERTIFICATE-----\nPublicCert1\n-----END CERTIFICATE-----",
          owner: "Test Owner",
          certificateIssuerOrganization: "Test Org",
          geographicFocus: "US",
          companyWebsite: "https://test.com",
        },
      ];

      // Mock the initial YAML content (based on actual ConfigMap structure)
      const mockYamlContent = `# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

apiVersion: v1
kind: ConfigMap
metadata:
  name: uds-ca-certs
  namespace: pepr-system
data:
  dodCACerts: old-dod-base64
  publicCACerts: old-public-base64
`;

      // Mock fs.promises methods
      const readFileSpy = vi.spyOn(fs.promises, "readFile").mockResolvedValue(mockYamlContent);
      const writeFileSpy = vi.spyOn(fs.promises, "writeFile").mockResolvedValue();

      const testConfigPath = path.join(tempDir, "test-configmap.yaml");

      await updateConfigMapWithCerts(dodCerts, publicCerts, testConfigPath);

      // Verify file was read correctly
      expect(readFileSpy).toHaveBeenCalledWith(testConfigPath, "utf8");

      // Verify file was written with updated content
      expect(writeFileSpy).toHaveBeenCalled();
      const writtenContent = writeFileSpy.mock.calls[0][1] as string;

      // Parse the written YAML and verify structure is preserved
      const parsedYaml = yaml.load(writtenContent) as {
        apiVersion: string;
        kind: string;
        metadata: { name: string; namespace: string };
        data: { dodCACerts: string; publicCACerts: string };
      };

      // Verify the YAML structure is maintained
      expect(parsedYaml.apiVersion).toBe("v1");
      expect(parsedYaml.kind).toBe("ConfigMap");
      expect(parsedYaml.metadata.name).toBe("uds-ca-certs");
      expect(parsedYaml.metadata.namespace).toBe("pepr-system");

      // Verify the certificates were base64 encoded and updated correctly
      const expectedDoDBase64 = Buffer.from(
        "-----BEGIN CERTIFICATE-----\nDoDCert1\n-----END CERTIFICATE-----",
        "utf8",
      ).toString("base64");
      const expectedPublicBase64 = Buffer.from(
        "-----BEGIN CERTIFICATE-----\nPublicCert1\n-----END CERTIFICATE-----",
        "utf8",
      ).toString("base64");

      expect(parsedYaml.data.dodCACerts).toBe(expectedDoDBase64);
      expect(parsedYaml.data.publicCACerts).toBe(expectedPublicBase64);

      // Verify old values were replaced
      expect(parsedYaml.data.dodCACerts).not.toBe("old-dod-base64");
      expect(parsedYaml.data.publicCACerts).not.toBe("old-public-base64");
    });

    it("should handle malformed YAML structure gracefully", async () => {
      const dodCerts: DoDCert[] = [];
      const publicCerts: PublicCACert[] = [];

      // Mock YAML with missing data structure
      const malformedYaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: uds-ca-certs
# Missing data section
`;

      vi.spyOn(fs.promises, "readFile").mockResolvedValue(malformedYaml);
      vi.spyOn(fs.promises, "writeFile").mockResolvedValue();

      const testConfigPath = path.join(tempDir, "malformed-configmap.yaml");

      // This should throw because configMap.data will be undefined
      await expect(
        updateConfigMapWithCerts(dodCerts, publicCerts, testConfigPath),
      ).rejects.toThrow();
    });

    it("should throw error when ConfigMap file doesn't exist", async () => {
      const dodCerts: DoDCert[] = [];
      const publicCerts: PublicCACert[] = [];
      const nonExistentPath = path.join(tempDir, "non-existent-configmap.yaml");

      // This will fail because the specified ConfigMap file doesn't exist
      await expect(
        updateConfigMapWithCerts(dodCerts, publicCerts, nonExistentPath),
      ).rejects.toThrow();
    });
  });
});
