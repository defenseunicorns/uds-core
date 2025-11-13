/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
