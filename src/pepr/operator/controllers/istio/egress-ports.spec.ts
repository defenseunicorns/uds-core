/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { RemoteProtocol } from "../../crd";
import { getAllowedPorts, getPortsForHostAllow } from "./egress-ports";

describe("getAllowedPorts", () => {
  it("should return ports array when provided", () => {
    expect(getAllowedPorts({ ports: [80, 443] })).toEqual([80, 443]);
  });

  it("should return port as array when provided", () => {
    expect(getAllowedPorts({ port: 8080 })).toEqual([8080]);
  });

  it("should return undefined when no ports provided", () => {
    expect(getAllowedPorts({})).toBeUndefined();
  });

  it("should prefer ports array over port", () => {
    expect(getAllowedPorts({ ports: [80], port: 443 })).toEqual([80]);
  });
});

describe("getPortsForHostAllow", () => {
  it("should return ports array when provided", () => {
    expect(getPortsForHostAllow({ ports: [53], remoteProtocol: RemoteProtocol.UDP })).toEqual([53]);
  });

  it("should return port as array when provided", () => {
    expect(getPortsForHostAllow({ port: 8080, remoteProtocol: RemoteProtocol.TCP })).toEqual([
      8080,
    ]);
  });

  it("should default to 443 for TLS without explicit ports", () => {
    expect(getPortsForHostAllow({ remoteProtocol: RemoteProtocol.TLS })).toEqual([443]);
  });

  it("should default to 80 for HTTP without explicit ports", () => {
    expect(getPortsForHostAllow({ remoteProtocol: RemoteProtocol.HTTP })).toEqual([80]);
  });

  it("should return empty array for TCP without ports (allowed by validator)", () => {
    expect(getPortsForHostAllow({ remoteProtocol: RemoteProtocol.TCP })).toEqual([]);
  });

  it("should return empty array for UDP without ports (allowed by validator)", () => {
    expect(getPortsForHostAllow({ remoteProtocol: RemoteProtocol.UDP })).toEqual([]);
  });
});
