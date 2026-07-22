/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  renderManifests,
  preRenderDomainScenarios,
  findResource,
  expectNoExcludedValues,
  containerEnvValue,
  resourceNumber,
  resourceStringArray,
  DOMAIN_SCENARIOS,
  K8sResource,
} from "./helpers.js";

const PKG = "portal";

let scenarioManifests: Map<string, K8sResource[]>;

beforeAll(async () => {
  scenarioManifests = await preRenderDomainScenarios(PKG);
});

describe("portal package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        "uds-portal": {
          "uds-portal": {
            replicaCount: 7,
            image: { repository: "SHOULD_NOT_APPEAR" },
          },
        },
      },
    });
  });

  it("portal deployment has seven replicas", () => {
    const r = findResource(manifests, "Deployment", "uds-portal");
    expect(resourceNumber(r, "spec", "replicas")).toBe(7);
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});

describe.each(DOMAIN_SCENARIOS)(
  "portal domain: $name",
  ({ name, expectedAdminDomain, expectedDomain }) => {
    let manifests: K8sResource[];

    beforeAll(() => {
      manifests = scenarioManifests.get(name)!;
    });

    it("portal UDS_DOMAIN uses expected domain", () => {
      const r = findResource(manifests, "Deployment", "uds-portal");
      expect(containerEnvValue(r, "UDS_DOMAIN")).toBe(expectedDomain);
    });

    it("portal UDS_ADMIN_DOMAIN uses expected admin domain", () => {
      const r = findResource(manifests, "Deployment", "uds-portal");
      expect(containerEnvValue(r, "UDS_ADMIN_DOMAIN")).toBe(expectedAdminDomain);
    });

    it("portal SSO redirect URI uses expected domain", () => {
      const r = findResource(manifests, "Package", "uds-portal");
      const redirectUris = resourceStringArray(r, "spec", "sso", 0, "redirectUris");
      expect(redirectUris).toContain(`https://portal.${expectedDomain}/auth`);
    });
  },
);
