/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a } from "pepr";
import { describe, expect, it, test, vi } from "vitest";
import { Sso, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import {
  getPodSelector,
  getWaypointName,
  hasAuthserviceSSO,
  matchesLabels,
  serviceMatchesSelector,
  shouldUseAmbientWaypoint,
} from "./waypoint-utils";

// Test helpers
const createMockPackage = (
  name: string,
  selector: Record<string, string> = {},
  mode: "ambient" | "sidecar" = "ambient",
  sso: Sso[] = [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: selector,
    },
  ],
): UDSPackage => ({
  metadata: {
    name,
    namespace: "test-ns",
    uid: "test-uid",
  },
  spec: {
    network: {
      serviceMesh: {
        mode: mode === "ambient" ? Mode.Ambient : Mode.Sidecar,
      },
    },
    sso,
  },
});

const createMockService = (
  selector: Record<string, string> = {},
  labels: Record<string, string> = {},
): a.Service => ({
  metadata: {
    name: "test-svc",
    namespace: "test-ns",
    labels: { ...labels },
  },
  spec: { selector: { ...selector } },
});

// Mock the utils module
vi.mock("../utils", () => ({
  getOwnerRef: vi.fn().mockReturnValue([
    {
      kind: "Package",
      name: "test-pkg",
      uid: "test-uid",
      apiVersion: "uds.dev/v1alpha1",
    },
  ]),
}));

describe("shouldUseAmbientWaypoint", () => {
  const testCases = [
    {
      name: "should return true when in ambient mode with SSO",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      expected: true,
    },
    {
      name: "should return false when not in ambient mode",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "sidecar", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      expected: false,
    },
    {
      name: "should return true when no serviceMesh config exists (ambient default)",
      pkg: {
        metadata: { name: "test", namespace: "test" },
        spec: {
          sso: [
            {
              clientId: "test-client",
              name: "test-sso",
              enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
            },
          ],
        },
      } as UDSPackage,
      expected: true,
    },
  ];

  it.each(testCases)("$name", ({ pkg, expected }) => {
    expect(shouldUseAmbientWaypoint(pkg)).toBe(expected);
  });
});

describe("matchesLabels", () => {
  const testCases = [
    {
      name: "should match when all key-value pairs match",
      labels: { app: "test", env: "prod" },
      selector: { app: "test", env: "prod" },
      expected: true,
    },
    {
      name: "should not match when values differ",
      labels: { app: "test", env: "prod" },
      selector: { app: "test", env: "dev" },
      expected: false,
    },
    {
      name: "should not match when key is missing",
      labels: { app: "test" },
      selector: { app: "test", missing: "key" },
      expected: false,
    },
    {
      name: "should match empty selector",
      labels: { app: "test" },
      selector: {},
      expected: true,
    },
  ];

  it.each(testCases)("$name", ({ labels, selector, expected }) => {
    expect(
      matchesLabels(labels as Record<string, string>, selector as Record<string, string>),
    ).toBe(expected);
  });
});

describe("serviceMatchesSelector", () => {
  const testCases = [
    {
      name: "should match when selectors match",
      service: createMockService({ app: "test" }),
      selector: { app: "test" },
      expected: true,
    },
    {
      name: "should not match when values differ",
      service: createMockService({ app: "test" }),
      selector: { app: "different" },
      expected: false,
    },
    {
      name: "should not match when key is missing",
      service: createMockService({}),
      selector: { app: "test" },
      expected: false,
    },
  ];

  test.each(testCases)("$name", ({ service, selector, expected }) => {
    expect(serviceMatchesSelector(service, selector)).toBe(expected);
  });
});

describe("hasAuthserviceSSO", () => {
  const testCases = [
    {
      name: "should return true when package has SSO with enableAuthserviceSelector",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      expected: true,
    },
    {
      name: "should return false when package has no SSO configuration",
      pkg: createMockPackage("test", {}, "ambient", []),
      expected: false,
    },
    {
      name: "should return false when package has SSO without enableAuthserviceSelector",
      pkg: createMockPackage("test", {}, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
        },
      ]),
      expected: false,
    },
    {
      name: "should return false when package spec is undefined",
      pkg: { metadata: { name: "test", namespace: "test" } } as UDSPackage,
      expected: false,
    },
  ];

  it.each(testCases)("$name", ({ pkg, expected }) => {
    expect(hasAuthserviceSSO(pkg)).toBe(expected);
  });
});

describe("getWaypointName", () => {
  const validTestCases = [
    { input: "test", expected: "test-waypoint" },
    { input: "uds-core-test", expected: "uds-core-test-waypoint" },
  ];

  it.each(validTestCases)("should handle '$input'", ({ input, expected }) => {
    expect(getWaypointName(input)).toBe(expected);
  });

  it("should throw an error when an empty ID is provided", () => {
    expect(() => getWaypointName("")).toThrow("Waypoint ID cannot be empty");
  });

  it("should throw an error when an ID with only whitespace is provided", () => {
    expect(() => getWaypointName("   ")).toThrow("Waypoint ID cannot be empty");
  });
});

describe("getPodSelector", () => {
  const testCases = [
    {
      name: "should return waypoint selector in ambient mode",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "ambient", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      selector: { app: "test" },
      waypointName: "test-waypoint",
      expected: { "istio.io/gateway-name": "test-waypoint" },
    },
    {
      name: "should return original selector in non-ambient mode",
      pkg: createMockPackage("test", { "app.kubernetes.io/name": "test-app" }, "sidecar", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]),
      selector: { app: "test" },
      waypointName: "test-waypoint",
      expected: { app: "test" },
    },
  ];

  it.each(testCases)("$name", ({ pkg, selector, waypointName, expected }) => {
    expect(getPodSelector(pkg, selector, waypointName)).toEqual(expected);
  });
});
