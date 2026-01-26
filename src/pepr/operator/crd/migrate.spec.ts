/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { buildMigratedAuthserviceStatus, migrate, migrateStatus } from "./migrate";
import { PkgStatus, Sso, UDSPackage } from ".";
import { AuthserviceClient } from "./generated/package-v1alpha1";

function makePkg(partial: Partial<UDSPackage>): UDSPackage {
  return {
    apiVersion: "uds.dev/v1alpha1",
    kind: "Package",
    metadata: {
      name: "test",
      namespace: "default",
      uid: "uid-1",
      generation: 1,
    },
    spec: {},
    status: {},
    ...partial,
  } as unknown as UDSPackage;
}

describe("buildMigratedAuthserviceStatus", () => {
  it("returns undefined when no status present", () => {
    const pkg = makePkg({ status: {} });
    expect(buildMigratedAuthserviceStatus(pkg)).toBeUndefined();
  });

  it("migrates legacy string[] into object[] using selectors from spec.sso", () => {
    const sso: Sso[] = [
      { name: "a", clientId: "client-a", enableAuthserviceSelector: { app: "a" } },
      { name: "b", clientId: "client-b", enableAuthserviceSelector: { app: "b" } },
    ];

    const pkg = makePkg({
      spec: { sso },
      status: { authserviceClients: ["client-a", "client-b"] as unknown as AuthserviceClient[] },
    });

    const migrated = buildMigratedAuthserviceStatus(pkg)!;
    expect(migrated).toEqual([
      { clientId: "client-a", selector: { app: "a" } },
      { clientId: "client-b", selector: { app: "b" } },
    ]);
  });

  it("returns existing object[] unchanged", () => {
    const existing: AuthserviceClient[] = [{ clientId: "x", selector: { app: "x" } }];
    const status: PkgStatus = { authserviceClients: existing };
    const pkg = makePkg({ status });
    const migrated = buildMigratedAuthserviceStatus(pkg)!;
    expect(migrated).toBe(existing);
  });
});

describe("migrateStatus", () => {
  it("mutates pkg.status to migrated object[] when legacy string[] present", () => {
    const pkg = makePkg({
      spec: {
        sso: [{ name: "a", clientId: "client-a", enableAuthserviceSelector: { app: "a" } }],
      },
      status: { authserviceClients: ["client-a"] as unknown as AuthserviceClient[] },
    });

    migrateStatus(pkg);

    expect(pkg.status?.authserviceClients).toEqual([
      { clientId: "client-a", selector: { app: "a" } },
    ]);
  });

  it("leaves pkg.status unchanged when no migration needed", () => {
    const existing: AuthserviceClient[] = [{ clientId: "z", selector: {} }];
    const status: PkgStatus = { authserviceClients: existing };
    const pkg = makePkg({ status });

    migrateStatus(pkg);

    expect(pkg.status?.authserviceClients).toBe(existing);
  });
});

describe("migrate SSO secretConfig fields", () => {
  it("migrates all secret-related fields to secretConfig", () => {
    const pkg = makePkg({
      spec: {
        sso: [
          {
            name: "test-client",
            clientId: "test",
            secretName: "my-secret",
            secretLabels: { app: "test" },
            secretAnnotations: { reload: "true" },
            secretTemplate: { "config.json": "{{secret}}" },
          } as Sso,
        ],
      },
    });

    migrate(pkg);

    const secretConfig = pkg.spec?.sso?.[0].secretConfig;
    expect(secretConfig?.name).toBe("my-secret");
    expect(secretConfig?.labels).toEqual({ app: "test" });
    expect(secretConfig?.annotations).toEqual({ reload: "true" });
    expect(secretConfig?.template).toEqual({ "config.json": "{{secret}}" });

    // Verify old fields are deleted
    expect(pkg.spec?.sso?.[0].secretName).toBeUndefined();
    expect(pkg.spec?.sso?.[0].secretLabels).toBeUndefined();
    expect(pkg.spec?.sso?.[0].secretAnnotations).toBeUndefined();
    expect(pkg.spec?.sso?.[0].secretTemplate).toBeUndefined();
  });

  it("preserves existing secretConfig when present", () => {
    const pkg = makePkg({
      spec: {
        sso: [
          {
            name: "test-client",
            clientId: "test",
            secretConfig: {
              name: "existing-secret",
              labels: { existing: "label" },
            },
          } as Sso,
        ],
      },
    });

    migrate(pkg);

    expect(pkg.spec?.sso?.[0].secretConfig).toEqual({
      name: "existing-secret",
      labels: { existing: "label" },
    });
  });

  it("gives precedence to new secretConfig fields over deprecated fields", () => {
    const pkg = makePkg({
      spec: {
        sso: [
          {
            name: "test-client",
            clientId: "test",
            secretName: "old-secret-name",
            secretLabels: { old: "label" },
            secretConfig: {
              name: "new-secret-name",
              labels: { new: "label" },
              annotations: { new: "annotation" },
            },
          } as Sso,
        ],
      },
    });

    migrate(pkg);

    // New fields should be preserved
    expect(pkg.spec?.sso?.[0].secretConfig?.name).toBe("new-secret-name");
    expect(pkg.spec?.sso?.[0].secretConfig?.labels).toEqual({ new: "label" });
    expect(pkg.spec?.sso?.[0].secretConfig?.annotations).toEqual({ new: "annotation" });

    // Deprecated fields should be deleted
    expect(pkg.spec?.sso?.[0].secretName).toBeUndefined();
    expect(pkg.spec?.sso?.[0].secretLabels).toBeUndefined();
  });

  it("migrates multiple SSO clients independently", () => {
    const pkg = makePkg({
      spec: {
        sso: [
          {
            name: "client-a",
            clientId: "a",
            secretName: "secret-a",
          } as Sso,
          {
            name: "client-b",
            clientId: "b",
            secretLabels: { app: "b" },
          } as Sso,
          {
            name: "client-c",
            clientId: "c",
          } as Sso,
        ],
      },
    });

    migrate(pkg);

    expect(pkg.spec?.sso?.[0].secretConfig?.name).toBe("secret-a");
    expect(pkg.spec?.sso?.[0].secretName).toBeUndefined();

    expect(pkg.spec?.sso?.[1].secretConfig?.labels).toEqual({ app: "b" });
    expect(pkg.spec?.sso?.[1].secretLabels).toBeUndefined();

    expect(pkg.spec?.sso?.[2].secretConfig).toBeUndefined();
  });
});
