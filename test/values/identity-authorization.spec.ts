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
  resourceString,
  DOMAIN_SCENARIOS,
  K8sResource,
} from "./helpers.js";

const PKG = "identity-authorization";

let scenarioManifests: Map<string, K8sResource[]>;

beforeAll(async () => {
  scenarioManifests = await preRenderDomainScenarios(PKG);
});

describe("identity-authorization package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        keycloak: {
          keycloak: {
            podLabels: { probe: "PROBE_VISIBLE" },
            image: { repository: "SHOULD_NOT_APPEAR" },
            configImage: "ghcr.io/example/uds-identity-config:custom",
          },
        },
        authservice: {
          authservice: {
            replicaCount: 7,
            image: { repository: "SHOULD_NOT_APPEAR" },
          },
        },
      },
    });
  });

  it("keycloak statefulset has probe label", () => {
    const r = findResource(manifests, "StatefulSet", "keycloak");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE",
    );
  });

  it("keycloak uses the configured config image", () => {
    const r = findResource(manifests, "StatefulSet", "keycloak");
    expect(resourceString(r, "spec", "template", "spec", "initContainers", 0, "image")).toBe(
      "ghcr.io/example/uds-identity-config:custom",
    );
  });

  it("authservice deployment has seven replicas", () => {
    const r = findResource(manifests, "Deployment", "authservice");
    expect(resourceNumber(r, "spec", "replicas")).toBe(7);
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});

describe.each(DOMAIN_SCENARIOS)(
  "identity-authorization domain: $name",
  ({ name, expectedAdminDomain, expectedDomain }) => {
    let manifests: K8sResource[];

    beforeAll(() => {
      manifests = scenarioManifests.get(name)!;
    });

    it("keycloak UDS_DOMAIN uses expected domain", () => {
      const r = findResource(manifests, "StatefulSet", "keycloak");
      expect(containerEnvValue(r, "UDS_DOMAIN")).toBe(expectedDomain);
    });

    it("keycloak UDS_ADMIN_DOMAIN uses expected admin domain", () => {
      const r = findResource(manifests, "StatefulSet", "keycloak");
      expect(containerEnvValue(r, "UDS_ADMIN_DOMAIN")).toBe(expectedAdminDomain);
    });

    it("envoyfilter Lua checks sso host with expected domain", () => {
      const r = findResource(
        manifests,
        "EnvoyFilter",
        "block-path-parameters-in-non-final-segments",
        "istio-system",
      );
      const json = JSON.stringify(r);
      expect(json).toContain(`sso.${expectedDomain}`);
    });

    it("envoyfilter Lua checks keycloak host with expected admin domain", () => {
      const r = findResource(
        manifests,
        "EnvoyFilter",
        "block-path-parameters-in-non-final-segments",
        "istio-system",
      );
      const json = JSON.stringify(r);
      expect(json).toContain(`keycloak.${expectedAdminDomain}`);
    });
  },
);
