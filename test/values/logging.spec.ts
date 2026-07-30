/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  renderManifests,
  findResource,
  expectNoExcludedValues,
  hasNetworkAllowDescription,
  resourceString,
  K8sResource,
} from "./helpers.js";

const PKG = "logging";

describe("logging package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        loki: {
          loki: {
            write: { podLabels: { probe: "PROBE_VISIBLE" } },
            global: { imageRegistry: "SHOULD_NOT_APPEAR" },
          },
          "uds-loki-config": {
            additionalNetworkAllow: [
              {
                direction: "Egress",
                selector: { "app.kubernetes.io/name": "loki" },
                remoteGenerated: "Anywhere",
                port: 9999,
                description: "PROBE_VISIBLE",
              },
            ],
          },
        },
        vector: {
          vector: {
            podLabels: { probe: "PROBE_VISIBLE" },
            image: { repository: "SHOULD_NOT_APPEAR" },
          },
          "uds-vector-config": {
            additionalNetworkAllow: [
              {
                direction: "Egress",
                selector: { "app.kubernetes.io/name": "vector" },
                remoteGenerated: "Anywhere",
                port: 9999,
                description: "PROBE_VISIBLE",
              },
            ],
          },
        },
      },
    });
  });

  it("loki write statefulset has probe label", () => {
    const r = findResource(manifests, "StatefulSet", "loki-write");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE",
    );
  });

  it("loki package has probe network rule", () => {
    const r = findResource(manifests, "Package", "loki");
    expect(hasNetworkAllowDescription(r, "PROBE_VISIBLE")).toBe(true);
  });

  it("vector daemonset has probe label", () => {
    const r = findResource(manifests, "DaemonSet", "vector");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE",
    );
  });

  it("vector package has probe network rule", () => {
    const r = findResource(manifests, "Package", "vector");
    expect(hasNetworkAllowDescription(r, "PROBE_VISIBLE")).toBe(true);
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});
