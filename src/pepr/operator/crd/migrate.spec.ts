/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { buildMigratedAuthserviceStatus, migrateStatus } from "./migrate";
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
