/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { parse } from "yaml";
import {
  renderManifests,
  findResource,
  expectNoExcludedValues,
  gatewayHosts,
  containerEnvValue,
  resourceString,
  resourceStringArray,
  K8sResource,
} from "./helpers.js";

const PKG = "standard";

const valuesPath = join(process.cwd(), "test/values/k3d-standard/values.yaml");
const sharedValues = parse(readFileSync(valuesPath, "utf-8")) as Record<string, unknown>;
const expectedDomain = "uds.dev";
const expectedAdminDomain = "admin.uds.dev";

let manifests: K8sResource[];

beforeAll(async () => {
  manifests = await renderManifests(PKG, { values: sharedValues });
});

describe("standard package values", () => {
  it("pepr deployment has probe label", () => {
    const r = findResource(manifests, "Deployment", "pepr-uds-core", "pepr-system");
    expect(
      resourceString(
        r,
        "spec",
        "template",
        "spec",
        "containers",
        0,
        "resources",
        "requests",
        "memory",
      ),
    ).toBe("256Mi");
  });

  it("ClusterConfig has probe cluster name", () => {
    const r = findResource(manifests, "ClusterConfig", "uds-cluster-config");
    expect(r).toBeDefined();
  });

  it("istiod deployment exists", () => {
    const r = findResource(manifests, "Deployment", "istiod", "istio-system");
    expect(r).toBeDefined();
  });

  it("admin gateway deployment exists", () => {
    const r = findResource(manifests, "Deployment", "admin-ingressgateway", "istio-admin-gateway");
    expect(r).toBeDefined();
  });

  it("tenant gateway deployment exists", () => {
    const r = findResource(
      manifests,
      "Deployment",
      "tenant-ingressgateway",
      "istio-tenant-gateway",
    );
    expect(r).toBeDefined();
  });

  it("keycloak statefulset exists", () => {
    const r = findResource(manifests, "StatefulSet", "keycloak");
    expect(r).toBeDefined();
  });

  it("grafana deployment exists", () => {
    const r = findResource(manifests, "Deployment", "grafana", "grafana");
    expect(r).toBeDefined();
  });

  it("loki write statefulset exists", () => {
    const r = findResource(manifests, "StatefulSet", "loki-write");
    expect(r).toBeDefined();
  });

  it("falco daemonset exists", () => {
    const r = findResource(manifests, "DaemonSet", "falco");
    expect(r).toBeDefined();
  });

  it("portal deployment exists", () => {
    const r = findResource(manifests, "Deployment", "uds-portal", "uds-portal");
    expect(r).toBeDefined();
  });

  it("velero deployment exists", () => {
    const r = findResource(manifests, "Deployment", "velero", "velero");
    expect(r).toBeDefined();
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});

describe("standard domain values", () => {
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

  it("keycloak UDS_DOMAIN uses expected domain", () => {
    const r = findResource(manifests, "StatefulSet", "keycloak");
    expect(containerEnvValue(r, "UDS_DOMAIN")).toBe(expectedDomain);
  });

  it("keycloak UDS_ADMIN_DOMAIN uses expected admin domain", () => {
    const r = findResource(manifests, "StatefulSet", "keycloak");
    expect(containerEnvValue(r, "UDS_ADMIN_DOMAIN")).toBe(expectedAdminDomain);
  });

  it("grafana root_url uses expected admin domain", () => {
    const r = findResource(manifests, "ConfigMap", "grafana");
    expect(r!.data!["grafana.ini"]).toContain(`root_url = https://grafana.${expectedAdminDomain}`);
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

  it("grafana SSO redirect URIs use expected admin domain", () => {
    const r = findResource(manifests, "Package", "grafana");
    const redirectUris = resourceStringArray(r, "spec", "sso", 0, "redirectUris");
    expect(redirectUris).toContain(`https://grafana.${expectedAdminDomain}/login/generic_oauth`);
    expect(redirectUris).toContain(`https://grafana.${expectedAdminDomain}/login`);
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
});
