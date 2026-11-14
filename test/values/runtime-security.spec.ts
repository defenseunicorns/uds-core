/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { parse } from "yaml";
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
            extraTolerations: [
              {
                key: "example.com/node-pool",
                operator: "Equal",
                value: "applications",
                effect: "NoSchedule",
              },
            ],
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

  it("falco daemonset appends extra tolerations to the chart defaults", () => {
    const r = findResource(manifests, "DaemonSet", "falco");
    expect(r?.spec?.template).toMatchObject({
      spec: {
        tolerations: [
          { effect: "NoSchedule", key: "node-role.kubernetes.io/master" },
          { effect: "NoSchedule", key: "node-role.kubernetes.io/control-plane" },
          {
            effect: "NoSchedule",
            key: "example.com/node-pool",
            operator: "Equal",
            value: "applications",
          },
        ],
      },
    });
  });

  it("falco default tolerations match the pinned upstream chart", async () => {
    const zarf = parse(readFileSync("src/falco/common/zarf.yaml", "utf8")) as {
      components: { charts?: { name: string; version: string }[] }[];
    };
    const version = zarf.components
      .flatMap(component => component.charts ?? [])
      .find(chart => chart.name === "falco")?.version;
    expect(version).toBeDefined();

    const response = await fetch(
      `https://raw.githubusercontent.com/falcosecurity/charts/falco-${version}/charts/falco/values.yaml`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok)
      throw new Error(`Could not read Falco chart ${version}: HTTP ${response.status}`);
    const upstream = parse(await response.text()) as { tolerations: unknown };

    const defaults = await renderManifests(PKG);
    const r = findResource(defaults, "DaemonSet", "falco");
    const pod = r?.spec?.template as { spec?: { tolerations?: unknown } } | undefined;
    expect(
      pod?.spec?.tolerations,
      `Falco chart ${version} changed its default tolerations; update src/falco/values/tolerations.yaml`,
    ).toEqual(upstream.tolerations);
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
