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
  hasNetworkAllowDescription,
  resourceNumber,
  resourceStringArray,
  DOMAIN_SCENARIOS,
  K8sResource,
} from "./helpers.js";

const PKG = "monitoring";

let scenarioManifests: Map<string, K8sResource[]>;

beforeAll(async () => {
  scenarioManifests = await preRenderDomainScenarios(PKG);
});

describe("monitoring package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        "kube-prometheus-stack": {
          "kube-prometheus-stack": {
            prometheus: { prometheusSpec: { replicas: 7 } },
            global: { imageRegistry: "SHOULD_NOT_APPEAR" },
          },
          "uds-prometheus-config": {
            additionalNetworkAllow: [
              { direction: "Egress", remoteGenerated: "Anywhere", description: "PROBE_VISIBLE" },
            ],
          },
        },
        "prometheus-blackbox-exporter": {
          "prometheus-blackbox-exporter": {
            replicas: 7,
            image: { registry: "SHOULD_NOT_APPEAR" },
          },
        },
        grafana: {
          grafana: {
            extraLabels: { probe: "PROBE_VISIBLE" },
            image: { registry: "SHOULD_NOT_APPEAR" },
          },
          "uds-grafana-config": {
            additionalNetworkAllow: [
              { direction: "Egress", remoteGenerated: "Anywhere", description: "PROBE_VISIBLE" },
            ],
          },
        },
      },
    });
  });

  it("prometheus has seven replicas", () => {
    const r = findResource(manifests, "Prometheus", "kube-prometheus-stack-prometheus");
    expect(resourceNumber(r, "spec", "replicas")).toBe(7);
  });

  it("prometheus package has probe network rule", () => {
    const r = findResource(manifests, "Package", "prometheus-stack");
    expect(hasNetworkAllowDescription(r, "PROBE_VISIBLE")).toBe(true);
  });

  it("blackbox exporter has seven replicas", () => {
    const r = findResource(manifests, "Deployment", "prometheus-blackbox-exporter");
    expect(resourceNumber(r, "spec", "replicas")).toBe(7);
  });

  it("grafana deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "grafana");
    expect(r!.metadata!.labels!.probe).toBe("PROBE_VISIBLE");
  });

  it("grafana package has probe network rule", () => {
    const r = findResource(manifests, "Package", "grafana");
    expect(hasNetworkAllowDescription(r, "PROBE_VISIBLE")).toBe(true);
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});

describe.each(DOMAIN_SCENARIOS)(
  "monitoring domain: $name",
  ({ name, expectedAdminDomain, expectedDomain }) => {
    let manifests: K8sResource[];

    beforeAll(() => {
      manifests = scenarioManifests.get(name)!;
    });

    it("grafana root_url uses expected admin domain", () => {
      const r = findResource(manifests, "ConfigMap", "grafana");
      expect(r!.data!["grafana.ini"]).toContain(
        `root_url = https://grafana.${expectedAdminDomain}`,
      );
    });

    it("grafana auth_url uses expected domain", () => {
      const r = findResource(manifests, "ConfigMap", "grafana");
      expect(r!.data!["grafana.ini"]).toContain(
        `auth_url = https://sso.${expectedDomain}/realms/uds/protocol/openid-connect/auth`,
      );
    });

    it("grafana token_url uses expected domain", () => {
      const r = findResource(manifests, "ConfigMap", "grafana");
      expect(r!.data!["grafana.ini"]).toContain(
        `token_url = https://sso.${expectedDomain}/realms/uds/protocol/openid-connect/token`,
      );
    });

    it("grafana signout_redirect_url uses expected domains", () => {
      const r = findResource(manifests, "ConfigMap", "grafana");
      const ini = r!.data!["grafana.ini"];
      expect(ini).toContain(`sso.${expectedDomain}/realms/uds/protocol/openid-connect/logout`);
      expect(ini).toContain(`grafana.${expectedAdminDomain}%2Flogin`);
    });

    it("grafana SSO redirect URI for generic_oauth uses expected admin domain", () => {
      const r = findResource(manifests, "Package", "grafana");
      const redirectUris = resourceStringArray(r, "spec", "sso", 0, "redirectUris");
      expect(redirectUris).toContain(`https://grafana.${expectedAdminDomain}/login/generic_oauth`);
    });

    it("grafana SSO redirect URI for login uses expected admin domain", () => {
      const r = findResource(manifests, "Package", "grafana");
      const redirectUris = resourceStringArray(r, "spec", "sso", 0, "redirectUris");
      expect(redirectUris).toContain(`https://grafana.${expectedAdminDomain}/login`);
    });
  },
);
