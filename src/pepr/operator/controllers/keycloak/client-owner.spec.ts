/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSConfig } from "../config/config";
import { UDSPackage } from "../../crd";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("pepr", () => ({
  K8s: () => ({ Get: (...args: unknown[]) => mockGet(...args) }),
  Log: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import {
  assertSoleLivePackageClaim,
  getPackageClientOwner,
  listLivePackages,
} from "./client-owner";

UDSConfig.domain = "uds.dev";

function packageFixture(overrides: Partial<UDSPackage> = {}): UDSPackage {
  return {
    metadata: {
      name: "app-package",
      namespace: "app-ns",
      uid: "app-package-uid",
    },
    spec: {
      sso: [
        {
          name: "App SSO",
          clientId: "my-app",
          enableAuthserviceSelector: { app: "my-app" },
          redirectUris: ["https://app.uds.dev/login"],
        },
      ],
      network: {
        expose: [
          {
            host: "app",
            uptime: { checks: { paths: ["/health"] } },
          },
        ],
      },
    },
    ...overrides,
  };
}

describe("Package Keycloak client ownership helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives the owner from Package metadata and requires a UID", () => {
    expect(getPackageClientOwner(packageFixture())).toEqual({
      uid: "app-package-uid",
      namespace: "app-ns",
      name: "app-package",
    });
    expect(() =>
      getPackageClientOwner(packageFixture({ metadata: { name: "app-package" } })),
    ).toThrow("metadata.uid");
  });

  it("confirms a sole claimant from the live Package list", async () => {
    const pkg = packageFixture();
    mockGet.mockResolvedValue({ items: [pkg], metadata: {} });

    await expect(
      assertSoleLivePackageClaim("my-app-probe", getPackageClientOwner(pkg)),
    ).resolves.toEqual(pkg);
    expect(mockGet).toHaveBeenCalledOnce();
  });

  it("fails closed on an incomplete Package list", async () => {
    mockGet.mockResolvedValueOnce({ items: [packageFixture()], metadata: { continue: "more" } });
    await expect(listLivePackages()).rejects.toThrow("incomplete Package list");

    mockGet.mockResolvedValueOnce({ metadata: {} });
    await expect(listLivePackages()).rejects.toThrow("incomplete Package list");
  });
});
