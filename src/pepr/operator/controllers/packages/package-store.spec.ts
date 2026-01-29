/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { beforeEach, describe, expect, it } from "vitest";
import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { PackageStore } from "./package-store";
PackageStore.init();

const makeMockReq = (pkg: Partial<UDSPackage>) => {
  const defaultPkg: UDSPackage = {
    metadata: {
      namespace: "application-system",
      name: "application",
    },
    spec: {
      network: {
        expose: [],
        allow: [],
      },
      sso: [],
      monitor: [],
    },
  };
  return {
    Raw: { ...defaultPkg, ...pkg },
  } as unknown as PeprValidateRequest<UDSPackage>;
};

// Helper function to create a package with SSO clients
const createPackageWithSsoClient = (
  namespace: string,
  name: string,
  clientId: string,
): UDSPackage => {
  return {
    metadata: {
      namespace,
      name,
    },
    spec: {
      network: {
        expose: [],
        allow: [],
      },
      sso: [
        {
          clientId,
          name: "Test Client",
          redirectUris: ["https://example.com/callback"],
        },
      ],
      monitor: [],
    },
  };
};

describe("Package Store", () => {
  it("Should add a package", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    PackageStore.add(mockReq.Raw);
    expect(PackageStore.hasKey(ns)).toEqual(true);
  });

  it("Should add multiple unique packages", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    const mockReqNewPkg = makeMockReq({ metadata: { namespace: "test", name: "other-package" } });
    const nsNewPkg = mockReqNewPkg.Raw.metadata?.namespace || "";
    PackageStore.add(mockReqNewPkg.Raw);
    let pkgsExist = false;
    if (PackageStore.hasKey(ns) && PackageStore.hasKey(nsNewPkg)) {
      pkgsExist = true;
    }
    expect(pkgsExist).toEqual(true);
  });

  it("Should return the first package in the namespace", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    const pkgName = mockReq.Raw.metadata?.name || "";
    expect(PackageStore.getPkgName(ns)).toEqual(pkgName);
  });

  it("Should update an existing package", async () => {
    const mockReq = makeMockReq({
      metadata: { namespace: "test", name: "other-package", labels: { test: "value" } },
    });
    const ns = mockReq.Raw.metadata?.namespace || "";
    const pkgName = mockReq.Raw.metadata?.name || "";
    PackageStore.add(mockReq.Raw);
    const updatedPackage = PackageStore.getPkgName(ns);
    expect(updatedPackage).toEqual(pkgName);
  });

  it("Should remove a package", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    PackageStore.remove(mockReq.Raw);
    expect(PackageStore.hasKey(ns)).toEqual(false);
  });

  describe("findPackagesWithSsoClientId", () => {
    // Reset the PackageStore before each test
    beforeEach(() => {
      PackageStore.init();
    });

    it("Should find a package with a specific SSO client ID", () => {
      // Create and add a package with an SSO client
      const pkg = createPackageWithSsoClient("test-ns", "test-app", "test-client-id");
      PackageStore.add(pkg);

      // Find namespaces with the client ID
      const result = PackageStore.findPackagesWithSsoClientId("test-client-id");

      // Verify the result
      expect(result.size).toEqual(1);
      expect(result.has("test-ns")).toBeTruthy();

      // Verify the package in the namespace has the expected client ID
      const pkgName = PackageStore.getPkgName("test-ns");
      expect(pkgName).toEqual("test-app");
    });

    it("Should return an empty set when no packages have the client ID", () => {
      // Create and add a package with an SSO client
      const pkg = createPackageWithSsoClient("test-ns", "test-app", "test-client-id");
      PackageStore.add(pkg);

      // Find namespaces with a non-existent client ID
      const result = PackageStore.findPackagesWithSsoClientId("non-existent-client-id");

      // Verify the result is empty
      expect(result.size).toEqual(0);
    });

    it("Should find multiple namespaces with the same SSO client ID", () => {
      // Create and add multiple packages with the same SSO client ID
      const pkg1 = createPackageWithSsoClient("test-ns-1", "test-app-1", "shared-client-id");
      const pkg2 = createPackageWithSsoClient("test-ns-2", "test-app-2", "shared-client-id");
      PackageStore.add(pkg1);
      PackageStore.add(pkg2);

      // Find namespaces with the shared client ID
      const result = PackageStore.findPackagesWithSsoClientId("shared-client-id");

      // Verify the result contains both namespaces
      expect(result.size).toEqual(2);
      expect(result.has("test-ns-1")).toBeTruthy();
      expect(result.has("test-ns-2")).toBeTruthy();

      // Verify the packages in each namespace
      expect(PackageStore.getPkgName("test-ns-1")).toEqual("test-app-1");
      expect(PackageStore.getPkgName("test-ns-2")).toEqual("test-app-2");
    });

    it("Should find a namespace with multiple SSO clients when one matches", () => {
      // Create a package with multiple SSO clients
      const pkg = createPackageWithSsoClient("test-ns", "test-app", "client-id-1");

      // Add a second SSO client to the package
      if (pkg.spec?.sso) {
        pkg.spec.sso.push({
          clientId: "client-id-2",
          name: "Second Test Client",
          redirectUris: ["https://example.com/callback2"],
        });
      }

      PackageStore.add(pkg);

      // Find namespaces with the second client ID
      const result = PackageStore.findPackagesWithSsoClientId("client-id-2");

      // Verify the result
      expect(result.size).toEqual(1);
      expect(result.has("test-ns")).toBeTruthy();

      // Verify the package in the namespace has the expected client ID
      const pkgName = PackageStore.getPkgName("test-ns");
      expect(pkgName).toEqual("test-app");
    });
  });

  describe("Ambient Waypoint", () => {
    // Reset the PackageStore before each test
    beforeEach(() => {
      PackageStore.init();
    });

    it("should not modify labels when ambient waypoint annotation is missing", () => {
      const pkg = makeMockReq({
        metadata: {
          name: "test-pkg",
          namespace: "test-ns",
          labels: {
            existing: "label",
          },
        },
      }).Raw;

      const originalLabels = { ...pkg.metadata!.labels };
      PackageStore.add(pkg);

      expect(pkg.metadata!.labels).toEqual(originalLabels);
    });

    it("should find all packages with ambient mode enabled", () => {
      // Add packages with and without ambient mode
      const ambientPkg1 = makeMockReq({
        metadata: { namespace: "ns1", name: "ambient1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
          },
        },
      }).Raw;

      const ambientPkg2 = makeMockReq({
        metadata: { namespace: "ns2", name: "ambient2" },
        spec: {
          network: {},
        },
      }).Raw;

      const nonAmbientPkg = makeMockReq({
        metadata: { namespace: "ns3", name: "non-ambient" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Sidecar },
          },
        },
      }).Raw;

      PackageStore.add(ambientPkg1);
      PackageStore.add(ambientPkg2);
      PackageStore.add(nonAmbientPkg);

      const ambientPackages = PackageStore.getAmbientPackages();

      expect(ambientPackages).toHaveLength(2);
      const packageNames = ambientPackages.map(pkg => pkg.metadata?.name).sort();
      expect(packageNames).toEqual(["ambient1", "ambient2"]);
    });

    it("should find ambient packages in a specific namespace", () => {
      // Add package to different namespaces
      const ambientPkg1 = makeMockReq({
        metadata: { namespace: "target-ns", name: "ambient1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
          },
        },
      }).Raw;

      // This one is in a different namespace
      const ambientPkgOtherNs = makeMockReq({
        metadata: { namespace: "other-ns", name: "ambient-other" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
          },
        },
      }).Raw;

      PackageStore.add(ambientPkg1);
      PackageStore.add(ambientPkgOtherNs);

      const ambientPackage = PackageStore.getPackageByNamespace("target-ns");

      expect(ambientPackage).toBeDefined();
      expect(ambientPackage?.metadata?.name).toBeDefined();
      // Since we now only get one package per namespace, we should get either ambient1 or ambient2
      expect(["ambient1", "ambient2"]).toContain(ambientPackage?.metadata?.name);
    });

    it("should return a package even if it's not in ambient mode", () => {
      // Add a non-ambient package
      const nonAmbientPkg = makeMockReq({
        metadata: { namespace: "empty-ns", name: "non-ambient" },
        spec: {
          network: {},
        },
      }).Raw;

      PackageStore.add(nonAmbientPkg);

      const pkg = PackageStore.getPackageByNamespace("empty-ns");
      expect(pkg).toBeDefined();
      expect(pkg?.metadata?.name).toBe("non-ambient");
      // Verify it's not in ambient mode
      expect(pkg?.spec?.network?.serviceMesh?.mode).not.toBe(Mode.Ambient);
    });

    it("should return undefined when namespace doesn't exist", () => {
      const ambientPackage = PackageStore.getPackageByNamespace("non-existent-ns");
      expect(ambientPackage).toBeUndefined();
    });
  });
});
