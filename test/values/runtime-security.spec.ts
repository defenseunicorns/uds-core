/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  renderManifests,
  findResource,
  expectNoExcludedValues,
  resourceString,
  K8sResource,
} from "./helpers.js";

const PKG = "runtime-security";

describe("runtime-security package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        falco: {
          falco: {
            podLabels: { probe: "PROBE_VISIBLE" },
            image: { registry: "SHOULD_NOT_APPEAR" },
          },
          "uds-falco-config": {
            disabledRules: ["PROBE_VISIBLE"],
            udsDefaultDisabledRulesStable: ["PROBE_DEFAULT"],
          },
        },
      },
    });
  });

  it("falco daemonset has probe label", () => {
    const r = findResource(manifests, "DaemonSet", "falco");
    expect(resourceString(r, "spec", "template", "metadata", "labels", "probe")).toBe(
      "PROBE_VISIBLE",
    );
  });

  it("falco disabled rules config has probe rule", () => {
    const r = findResource(manifests, "ConfigMap", "falco-disable-rules");
    expect(r!.data!["disable-rules.yaml"]).toContain("PROBE_VISIBLE");
  });

  it("falco default disabled rules are overridable", () => {
    const r = findResource(manifests, "ConfigMap", "falco-disable-rules");
    expect(r!.data!["disable-rules.yaml"]).toContain("PROBE_DEFAULT");
  });

  it("excludePaths block SHOULD_NOT_APPEAR values", () => {
    expectNoExcludedValues(manifests);
  });
});
