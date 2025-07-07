/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { generateWaypoint, waypointName } from "./waypoint";
import { ambientEgressNamespace, sharedEgressPkgId } from "./egress-ambient";

describe("test generate waypoint", () => {
  it("should generate waypoint", () => {
    const pkgs = new Set(["test-pkg1", "test-pkg2"]);
    const generation = 1;

    const waypoint = generateWaypoint(pkgs, generation);

    expect(waypoint).toBeDefined();
    expect(waypoint.metadata?.name).toEqual(waypointName);
    expect(waypoint.metadata?.namespace).toEqual(ambientEgressNamespace);
    expect(waypoint.metadata?.labels).toEqual({
      "uds/package": sharedEgressPkgId,
      "uds/generation": generation.toString(),
    });
    expect(waypoint.metadata?.annotations).toEqual({
      "uds.dev/user-test-pkg1": "user",
      "uds.dev/user-test-pkg2": "user",
    });
    expect(waypoint.spec?.gatewayClassName).toEqual("istio-waypoint");
    expect(waypoint.spec?.listeners).toBeDefined();
    expect(waypoint.spec?.infrastructure).toBeDefined();
  });
});
