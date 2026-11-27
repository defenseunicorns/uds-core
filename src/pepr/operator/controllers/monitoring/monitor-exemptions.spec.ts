/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { expect, it } from "vitest";
import { UDSPackage } from "../../crd";
import {
  buildMonitorOperations,
  computeMonitorExemptions,
  monitorWaypoints,
} from "./monitor-exemptions";

it("leaves policies unscoped when there are no monitor endpoints", () => {
  expect(buildMonitorOperations([])).toEqual({ metrics: [], nonMetrics: [] });
});

it("groups paths once and preserves default paths and missing-port behavior", () => {
  expect(
    buildMonitorOperations([
      { port: "80" },
      { port: "80", path: "/custom" },
      { port: "80", path: "/custom" },
      { port: "90" },
      { path: "/ignored" },
    ]),
  ).toEqual({
    metrics: [
      { operation: { ports: ["80"], paths: ["/custom"] } },
      { operation: { ports: ["90"], paths: ["/metrics"] } },
    ],
    nonMetrics: [
      { operation: { ports: ["80"], notPaths: ["/custom"] } },
      { operation: { ports: ["90"], notPaths: ["/metrics"] } },
      { operation: { notPorts: ["80", "90"] } },
    ],
  });
});

it("uses Pod selectors and preserves namespace-wide monitor selection", () => {
  const pkg: UDSPackage = {
    spec: {
      monitor: [
        {
          selector: { service: "web" },
          podSelector: { app: "web" },
          portName: "http",
          targetPort: 80,
        },
        { selector: { app: "other" }, portName: "http", targetPort: 90, path: "/custom" },
      ],
    },
  };
  expect(computeMonitorExemptions(pkg, { app: "web" })).toEqual([{ port: "80", path: "/metrics" }]);
  expect(computeMonitorExemptions(pkg, { app: "missing" })).toEqual([]);
  expect(computeMonitorExemptions(pkg, {})).toHaveLength(2);
});

it("keeps direct scrapes and selects every compatible host waypoint for a broader monitor", () => {
  const monitor = {
    selector: { service: "web" },
    podSelector: { app: "web" },
    portName: "http",
    targetPort: 80,
  };
  const pkg: UDSPackage = {
    spec: {
      sso: ["blue", "green", "other"].map(name => ({
        name,
        clientId: name,
        authservice: { exposeHost: name },
      })),
      network: {
        expose: ["blue", "green", "other"].map(host => ({
          host,
          selector: { app: host === "other" ? "other" : "web", component: host },
        })),
      },
    },
  };
  expect(monitorWaypoints(pkg, monitor)).toEqual([undefined, "blue-waypoint", "green-waypoint"]);
  expect(
    monitorWaypoints(pkg, { ...monitor, podSelector: { app: "web", component: "blue" } }),
  ).toEqual(["blue-waypoint"]);
});
