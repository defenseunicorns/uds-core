/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSConfig } from "../config/config";
import { UDSPackage } from "../../crd";

const { mockRaw } = vi.hoisted(() => ({ mockRaw: vi.fn() }));

vi.mock("pepr", () => ({
  K8s: () => ({ Raw: (...args: unknown[]) => mockRaw(...args) }),
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
  hasLegacyOperatorManagementEvidence,
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

  it("reads every Package page before confirming a sole claimant", async () => {
    const pkg = packageFixture();
    mockRaw
      .mockResolvedValueOnce({ items: [pkg], metadata: { continue: "next-page" } })
      .mockResolvedValueOnce({ items: [], metadata: {} });

    await expect(
      assertSoleLivePackageClaim("my-app-probe", getPackageClientOwner(pkg)),
    ).resolves.toEqual(pkg);
    expect(mockRaw).toHaveBeenCalledTimes(2);
    expect(mockRaw.mock.calls[0][0]).toContain("limit=500");
    expect(mockRaw.mock.calls[1][0]).toContain("continue=next-page");
  });

  it("fails closed when Kubernetes repeats a Package-list continuation token", async () => {
    mockRaw.mockResolvedValue({ items: [packageFixture()], metadata: { continue: "same" } });
    await expect(listLivePackages()).rejects.toThrow("repeated a Package list continuation token");
  });

  it("accepts legacy ordinary-client evidence only with status and operator-written attributes", () => {
    const pkg = packageFixture({ status: { ssoClients: ["my-app"] } });
    expect(
      hasLegacyOperatorManagementEvidence(pkg, "my-app", {
        attributes: { "uds.core.groups": "[]" },
      }),
    ).toBe(true);
    expect(
      hasLegacyOperatorManagementEvidence(packageFixture(), "my-app", {
        attributes: { "uds.core.groups": "[]" },
      }),
    ).toBe(false);
    expect(
      hasLegacyOperatorManagementEvidence(pkg, "my-app", {
        attributes: {},
      }),
    ).toBe(false);
  });

  it("recognizes legacy clients from their Keycloak configuration after SSO is removed", () => {
    const pkg = packageFixture({
      spec: { sso: [], network: {} },
      status: { ssoClients: ["my-app", "my-app-probe"] },
    });
    expect(
      hasLegacyOperatorManagementEvidence(pkg, "my-app", {
        attributes: { "uds.core.groups": "[]" },
      }),
    ).toBe(true);
    expect(
      hasLegacyOperatorManagementEvidence(pkg, "my-app-probe", {
        fullScopeAllowed: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
        protocolMappers: [
          {
            name: "audience",
            protocol: "openid-connect",
            protocolMapper: "oidc-audience-mapper",
            config: { "included.client.audience": "my-app" },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects ambiguous Keycloak configuration shapes", () => {
    const pkg = packageFixture({ status: { ssoClients: ["my-app-probe"] } });
    expect(
      hasLegacyOperatorManagementEvidence(pkg, "my-app-probe", {
        attributes: { "uds.core.groups": "[]" },
        fullScopeAllowed: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
        protocolMappers: [
          {
            name: "audience",
            protocol: "openid-connect",
            protocolMapper: "oidc-audience-mapper",
            config: { "included.client.audience": "my-app" },
          },
        ],
      }),
    ).toBe(false);
  });
});
