/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, it } from "vitest";
import { findResource, renderManifests, resourceNumber, K8sResource } from "./helpers.js";

const PKG = "metrics-server";

describe("metrics-server package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        "metrics-server": {
          "metrics-server": {
            replicas: 3,
          },
        },
      },
    });
  });

  it("applies replica overrides to the Metrics Server deployment", () => {
    const deployment = findResource(manifests, "Deployment", "metrics-server", "metrics-server");
    expect(resourceNumber(deployment, "spec", "replicas")).toBe(3);
  });
});
