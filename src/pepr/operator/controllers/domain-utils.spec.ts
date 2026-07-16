/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { Expose } from "../crd";
import { UDSConfig } from "./config/config";
import { getFqdn } from "./domain-utils";

UDSConfig.domain = "uds.dev";
UDSConfig.adminDomain = "admin.uds.dev";

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
});
