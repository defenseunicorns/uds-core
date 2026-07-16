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
  gatewayHosts,
  resourceString,
  DOMAIN_SCENARIOS,
  K8sResource,
} from "./helpers.js";

const PKG = "base";

let scenarioManifests: Map<string, K8sResource[]>;

beforeAll(async () => {
  scenarioManifests = await preRenderDomainScenarios(PKG);
});

describe("base package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        "pepr-uds-core": {
          module: {
            admission: {
              podLabels: { probe: "PROBE_VISIBLE_PEPR" },
              image: "SHOULD_NOT_APPEAR",
            },
          },
        },
        "uds-operator-config": {
          "uds-operator-config": {
            cluster: { attributes: { clusterName: "PROBE_VISIBLE_OPERATOR" } },
          },
        },
        "istio-controlplane": {
          base: { global: { hub: "SHOULD_NOT_APPEAR" } },
          istiod: {
            podLabels: { probe: "PROBE_VISIBLE_ISTIOD" },
            global: { hub: "SHOULD_NOT_APPEAR" },
          },
          "uds-global-istio-config": {
            classificationBanner: {
              enabledHosts: ["probe-visible-global.uds.dev"],
            },
          },
          cni: {
            podLabels: { probe: "PROBE_VISIBLE_CNI" },
            global: { hub: "SHOULD_NOT_APPEAR" },
          },
          ztunnel: {
            podLabels: { probe: "PROBE_VISIBLE_ZTUNNEL" },
            image: "SHOULD_NOT_APPEAR",
          },
        },
        "istio-admin-gateway": {
          gateway: {
            labels: { probe: "PROBE_VISIBLE_ADMIN" },
            global: { hub: "SHOULD_NOT_APPEAR" },
          },
          "uds-istio-config": {
            rootDomain: {
              enabled: true,
              tls: { mode: "SIMPLE", credentialName: "PROBE_VISIBLE_ADMINCFG" },
            },
            name: "SHOULD_NOT_APPEAR",
          },
        },
        "istio-tenant-gateway": {
          gateway: {
            labels: { probe: "PROBE_VISIBLE_TENANT" },
            global: { hub: "SHOULD_NOT_APPEAR" },
          },
          "uds-istio-config": {
            rootDomain: {
              enabled: true,
              tls: { mode: "SIMPLE", credentialName: "PROBE_VISIBLE_TENANTCFG" },
            },
            name: "SHOULD_NOT_APPEAR",
          },
        },
        "istio-passthrough-gateway": {
          gateway: {
            labels: { probe: "PROBE_VISIBLE_PASSTHROUGH" },
            global: { hub: "SHOULD_NOT_APPEAR" },
          },
          "uds-istio-config": {
            rootDomain: {
              enabled: true,
              tls: { mode: "SIMPLE", credentialName: "PROBE_VISIBLE_PASSTHROUGHCFG" },
            },
            name: "SHOULD_NOT_APPEAR",
          },
        },
        "istio-egress-ambient": {
          "uds-istio-egress-config": {
            config: {
              serviceAccount: {
                metadata: { annotations: { probe: "PROBE_VISIBLE_EGRESSCFG" } },
              },
            },
          },
        },
        "istio-egress-gateway": {
          gateway: {
            labels: { probe: "PROBE_VISIBLE_EGRESS" },
            global: { hub: "SHOULD_NOT_APPEAR" },
          },
        },
        "envoy-gateway": {
          "envoy-gateway": {
            deployment: {
              pod: { labels: { probe: "PROBE_VISIBLE_ENVOY" } },
              envoyGateway: { image: "SHOULD_NOT_APPEAR" },
            },
          },
          "uds-envoy-gateway-config": {
            global: { images: { envoyGateway: { image: "SHOULD_NOT_APPEAR" } } },
          },
        },
      },
    });
  });

  it("pepr deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "pepr-uds-core", "pepr-system");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_PEPR",
    );
  });

  it("ClusterConfig has probe cluster name", () => {
    const r = findResource(manifests, "ClusterConfig", "uds-cluster-config");
    expect(resourceString(r, "spec", "attributes", "clusterName")).toBe("PROBE_VISIBLE_OPERATOR");
  });

  it("istiod deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "istiod");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_ISTIOD",
    );
  });

  it("classification banner includes probe host", () => {
    const r = findResource(manifests, "EnvoyFilter", "classification-banner");
    const json = JSON.stringify(r);
    expect(json).toContain("probe-visible-global");
  });

  it("istio CNI daemonset has probe label", () => {
    const r = findResource(manifests, "DaemonSet", "istio-cni-node");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_CNI",
    );
  });

  it("ztunnel daemonset has probe label", () => {
    const r = findResource(manifests, "DaemonSet", "ztunnel");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_ZTUNNEL",
    );
  });

  it("admin gateway deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "admin-ingressgateway");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_ADMIN",
    );
  });

  it("admin gateway has probe TLS credential", () => {
    const r = findResource(manifests, "Gateway", "admin-gateway", "istio-admin-gateway");
    const json = JSON.stringify(r);
    expect(json).toContain("PROBE_VISIBLE_ADMINCFG");
  });

  it("tenant gateway deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "tenant-ingressgateway");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_TENANT",
    );
  });

  it("tenant gateway has probe TLS credential", () => {
    const r = findResource(manifests, "Gateway", "tenant-gateway", "istio-tenant-gateway");
    const json = JSON.stringify(r);
    expect(json).toContain("PROBE_VISIBLE_TENANTCFG");
  });

  it("passthrough gateway deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "passthrough-ingressgateway");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_PASSTHROUGH",
    );
  });

  it("passthrough gateway has probe TLS credential", () => {
    const r = findResource(
      manifests,
      "Gateway",
      "passthrough-gateway",
      "istio-passthrough-gateway",
    );
    const json = JSON.stringify(r);
    expect(json).toContain("PROBE_VISIBLE_PASSTHROUGHCFG");
  });

  it("egress waypoint config has probe annotation", () => {
    const r = findResource(manifests, "ConfigMap", "egress-waypoint-config");
    expect(r!.data!.serviceAccount).toContain("PROBE_VISIBLE_EGRESSCFG");
  });

  it("egress gateway deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "egressgateway");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_EGRESS",
    );
  });

  it("envoy gateway deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "envoy-gateway", "envoy-gateway-system");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE_ENVOY",
    );
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});

describe.each(DOMAIN_SCENARIOS)(
  "base domain: $name",
  ({ name, expectedAdminDomain, expectedDomain }) => {
    let manifests: K8sResource[];

    beforeAll(() => {
      manifests = scenarioManifests.get(name)!;
    });

    it("admin gateway wildcard host uses expected admin domain", () => {
      const r = findResource(manifests, "Gateway", "admin-gateway", "istio-admin-gateway");
      const hosts = gatewayHosts(r);
      expect(hosts).toContain(`*.${expectedAdminDomain}`);
    });

    it("admin gateway keycloak host uses expected admin domain", () => {
      const r = findResource(manifests, "Gateway", "admin-gateway", "istio-admin-gateway");
      const hosts = gatewayHosts(r);
      expect(hosts).toContain(`keycloak.${expectedAdminDomain}`);
    });

    it("tenant gateway wildcard host uses expected domain", () => {
      const r = findResource(manifests, "Gateway", "tenant-gateway", "istio-tenant-gateway");
      const hosts = gatewayHosts(r);
      expect(hosts).toContain(`*.${expectedDomain}`);
    });

    it("tenant gateway sso host uses expected domain", () => {
      const r = findResource(manifests, "Gateway", "tenant-gateway", "istio-tenant-gateway");
      const hosts = gatewayHosts(r);
      expect(hosts).toContain(`sso.${expectedDomain}`);
    });

    it("passthrough gateway wildcard host uses expected domain", () => {
      const r = findResource(
        manifests,
        "Gateway",
        "passthrough-gateway",
        "istio-passthrough-gateway",
      );
      const hosts = gatewayHosts(r);
      expect(hosts).toContain(`*.${expectedDomain}`);
    });

    it("ClusterConfig domain uses expected domain", () => {
      const r = findResource(manifests, "ClusterConfig", "uds-cluster-config");
      expect(resourceString(r, "spec", "expose", "domain")).toBe(expectedDomain);
    });

    it("ClusterConfig adminDomain uses expected admin domain", () => {
      const r = findResource(manifests, "ClusterConfig", "uds-cluster-config");
      expect(resourceString(r, "spec", "expose", "adminDomain")).toBe(expectedAdminDomain);
    });
  },
);
