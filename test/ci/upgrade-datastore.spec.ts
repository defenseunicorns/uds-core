/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("upgrade datastore", () => {
  it("configures the single-server embedded etcd datastore for both upgrade installers", () => {
    const args = "--k3s-arg=--cluster-init@server:0";
    const legacy = parse(readFileSync("bundles/k3d-standard/uds-upgrade-test-config.yaml", "utf8"));
    const next = readFileSync("bundles/k3d-standard-next/config-upgrade.uds.hcl", "utf8");
    expect(legacy.variables["uds-k3d-dev"]?.K3D_EXTRA_ARGS).toBe(args);
    expect(next.split("\n").map(line => line.trim())).toContain(`k3d_extra_args = "${args}"`);
  });
});
