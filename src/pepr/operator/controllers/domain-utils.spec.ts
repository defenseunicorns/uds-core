/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { Expose } from "../crd";
import { UDSConfig } from "./config/config";
import {
  getAdminAppUrl,
  getAdminBaseUrl,
  getFqdn,
  getHost,
  getPublicBaseUrl,
  getSsoUrl,
  normalizeContextPath,
} from "./domain-utils";

UDSConfig.domain = "uds.dev";
UDSConfig.adminDomain = "admin.uds.dev";
UDSConfig.subdomain = "";
UDSConfig.contextPath = "";
UDSConfig.adminContextPath = "/admin";
UDSConfig.pathRouting = false;

describe("getFqdn", () => {
  it("should return fqdn for tenant gateway", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    expect(getFqdn(expose)).toEqual("app.uds.dev");
  });

  it("should return fqdn for admin gateway", () => {
    const expose: Expose = { host: "app", gateway: "admin" };
    expect(getFqdn(expose)).toEqual("app.admin.uds.dev");
  });

  it("should use admin domain for custom gateways containing 'admin'", () => {
    const expose: Expose = { host: "app", gateway: "my-admin-gateway" };
    expect(getFqdn(expose)).toEqual("app.admin.uds.dev");
  });

  it("should return domain only when host is '.'", () => {
    const expose: Expose = { host: ".", gateway: "tenant" };
    expect(getFqdn(expose)).toEqual("uds.dev");
  });

  it("should use expose.domain when specified for custom gateways", () => {
    const expose: Expose = { host: "app", gateway: "custom-gateway", domain: "custom.example.com" };
    expect(getFqdn(expose)).toEqual("app.custom.example.com");
  });

  it("should return the shared host for standard gateways when path routing is enabled", () => {
    UDSConfig.pathRouting = true;
    UDSConfig.subdomain = "foo";
    const expose: Expose = { host: "app", gateway: "admin" };
    expect(getFqdn(expose)).toEqual("foo.uds.dev");
    UDSConfig.pathRouting = false;
    UDSConfig.subdomain = "";
  });
});

describe("path routing URL helpers", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    ["/", ""],
    ["bar", "/bar"],
    ["/bar", "/bar"],
  ])("normalizes context path %s", (path, expected) => {
    expect(normalizeContextPath(path)).toEqual(expected);
  });

  it("computes single-host public and admin URLs", () => {
    UDSConfig.pathRouting = true;
    UDSConfig.subdomain = "foo";
    UDSConfig.contextPath = "/bar";
    UDSConfig.adminContextPath = "/admin";

    expect(getHost()).toEqual("foo.uds.dev");
    expect(getPublicBaseUrl()).toEqual("https://foo.uds.dev/bar");
    expect(getAdminBaseUrl()).toEqual("https://foo.uds.dev/bar/admin");
    expect(getSsoUrl()).toEqual("https://foo.uds.dev/bar/sso");
    expect(getAdminAppUrl("grafana")).toEqual("https://foo.uds.dev/bar/admin/grafana");

    UDSConfig.pathRouting = false;
    UDSConfig.subdomain = "";
    UDSConfig.contextPath = "";
    UDSConfig.adminContextPath = "/admin";
  });

  it("preserves legacy SSO and admin URLs when path routing is disabled", () => {
    expect(getSsoUrl()).toEqual("https://sso.uds.dev");
    expect(getAdminAppUrl("grafana")).toEqual("https://grafana.admin.uds.dev");
  });
});
