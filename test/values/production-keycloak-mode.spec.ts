/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const productionBundles = ["aks", "eks", "rke2"] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function productionKeycloakValues(bundleName: string): unknown[] {
  const bundle = parse(
    readFileSync(join(process.cwd(), `.github/bundles/${bundleName}/uds-bundle.yaml`), "utf8"),
  ) as RecordValue;
  const packages = Array.isArray(bundle.packages) ? bundle.packages : [];
  const corePackage = packages.find(
    packageValue => isRecord(packageValue) && packageValue.name === "core",
  );
  const overrides = isRecord(corePackage) ? corePackage.overrides : undefined;
  const keycloak = isRecord(overrides) ? overrides.keycloak : undefined;
  const keycloakChart = isRecord(keycloak) ? keycloak.keycloak : undefined;
  const values = isRecord(keycloakChart) ? keycloakChart.values : undefined;
  return Array.isArray(values) ? values : [];
}

describe("production Keycloak bundle mode", () => {
  it.each(productionBundles)("sets devMode false in the %s bundle", bundleName => {
    expect(productionKeycloakValues(bundleName)).toContainEqual({
      path: "devMode",
      value: false,
    });
  });
});
