// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendConstraints,
  isEligibleRelease,
  buildDependencyObservation,
  readVersionRules,
  restrictionsForPin,
  selectFamilyRelease,
  type Dependency,
  type Observation,
  type Snapshot,
} from "./discover-versions";

const dependency: Dependency = {
  datasource: "docker",
  packageName: "example/app",
  tagPattern: "^v(?<version>\\d+\\.\\d+\\.\\d+)-fips$",
};
const pin = { file: "src/app/zarf.yaml", currentValue: "v1.0.0-fips" };
const release = { tag: "v1.2.0-fips", version: "1.2.0", eligible: true };

// Use captured selection rules for repeatable restriction checks, not a live preset lookup.
const preset = "github>defenseunicorns/uds-common//config/renovate.json5";
const readPresetFixture = () =>
  readFile(resolve(__dirname, "fixtures/uds-common-selection.json5"), "utf8");

function imageObservation(name: string, tags: string[], current = pin.currentValue): Observation {
  return buildDependencyObservation(
    { ...dependency, packageName: name },
    "unicorn",
    [{ ...pin, currentValue: current }],
    tags.map(tag => ({ tag, eligible: true })),
  );
}

function appObservation(): Observation {
  return buildDependencyObservation(
    {
      datasource: "github-tags",
      packageName: "example/app",
      tagPattern: "^(?<version>\\d+\\.\\d+\\.\\d+)$",
    },
    "app",
    [{ file: "src/app/tasks.yaml", currentValue: "1.0.0" }],
    ["1.0.0", "1.1.0", "1.2.0"].map(tag => ({ tag, eligible: true })),
  );
}

function snapshot(...dependencies: Observation[]): Snapshot {
  return {
    schemaVersion: 2,
    observedAt: "2026-11-12T12:00:00Z",
    mainSha: "a".repeat(40),
    families: [selectFamilyRelease("app", dependencies)],
  };
}

describe("shared-release selection", () => {
  it("requires every image in every flavor and reports the publisher holding back the newest release", () => {
    const upstream = imageObservation("one", ["v1.1.0-fips", "v1.2.0-fips"]);
    upstream.flavor = "upstream";

    const result = selectFamilyRelease("app", [
      appObservation(),
      upstream,
      imageObservation("two", ["v1.1.0-fips", "v1.2.0-fips"]),
      imageObservation("three", ["v1.1.0-fips"]),
    ]);

    expect(result.status).toBe("update-available");
    expect(result.selectedRelease).toBe("1.1.0");
    expect(result.targets.map(target => target.tag)).toEqual([
      "1.1.0",
      "v1.1.0-fips",
      "v1.1.0-fips",
      "v1.1.0-fips",
    ]);
    expect(result.publisherGaps).toEqual([
      { flavor: "unicorn", packageName: "three", missingRelease: "1.2.0" },
    ]);
  });

  it("intersects actual tag sets instead of assuming each publisher has every lower version", () => {
    const result = selectFamilyRelease("app", [
      appObservation(),
      imageObservation("one", ["v1.0.0-fips", "v1.2.0-fips"]),
      imageObservation("two", ["v1.0.0-fips", "v1.1.0-fips"]),
    ]);

    expect(result.status).toBe("current");
    expect(result.selectedRelease).toBe("1.0.0");
    expect(result.targets.map(target => target.tag)).toEqual([
      "1.0.0",
      "v1.0.0-fips",
      "v1.0.0-fips",
    ]);
  });

  it("retains every current occurrence if any pin would downgrade", () => {
    const one = imageObservation("one", ["v1.1.0-fips"], "v1.2.0-fips");
    one.current.push({ ...pin, currentValue: "v1.3.0-fips", version: "1.3.0" });

    const result = selectFamilyRelease("app", [
      appObservation(),
      one,
      imageObservation("two", ["v1.1.0-fips"]),
    ]);

    expect(result.status).toBe("downgrade-blocked");
    expect(result.selectedRelease).toBeNull();
    expect(result.targets.map(target => target.tag)).toEqual([
      "1.0.0",
      "v1.2.0-fips",
      "v1.3.0-fips",
      "v1.0.0-fips",
    ]);
  });

  it("aligns mixed current versions forward", () => {
    const result = selectFamilyRelease("app", [
      appObservation(),
      imageObservation("one", ["v1.2.0-fips"], "v1.1.0-fips"),
      imageObservation("two", ["v1.2.0-fips"], "v1.2.0-fips"),
    ]);

    expect(result.selectedRelease).toBe("1.2.0");
    expect(result.targets.map(target => target.tag)).toEqual([
      "1.2.0",
      "v1.2.0-fips",
      "v1.2.0-fips",
    ]);
  });

  it("retains original pins when no release is shared", () => {
    const result = selectFamilyRelease("app", [
      appObservation(),
      imageObservation("one", ["v2.0.0-fips"]),
    ]);

    expect(result.status).toBe("no-shared-release");
    expect(result.targets.map(target => target.tag)).toEqual(["1.0.0", "v1.0.0-fips"]);
  });

  it("selects the newest version from unordered catalogs while preserving the current raw-tag style", () => {
    const source = appObservation();
    source.releases.reverse();
    const one = buildDependencyObservation(
      { ...dependency, tagPattern: "^v?(?<version>\\d+\\.\\d+\\.\\d+)-fips$" },
      "unicorn",
      [pin],
      ["latest", "v9.0.0-rc.1-fips", "1.1.0-fips", "v1.1.0-fips", "1.2.0-fips", "v1.2.0-fips"].map(
        tag => ({ tag, eligible: true }),
      ),
    );

    const result = selectFamilyRelease("app", [source, one]);

    expect(one.latestVersion).toBe("1.2.0");
    expect(result.selectedRelease).toBe("1.2.0");
    expect(result.targets[1].tag).toBe("v1.2.0-fips");
  });

  it("requires the application pin as well as image pins before generating constraints", () => {
    const source = appObservation();
    source.current = [];

    const input = snapshot(source, imageObservation("one", ["v1.1.0-fips"]));

    expect(input.families[0].status).toBe("missing-pin");
    expect(() => appendConstraints({}, input)).toThrow(/missing.pin/i);
  });
});

describe("generated constraints", () => {
  it("appends scoped raw-tag constraints without changing grouping, unrelated config, or the input", () => {
    const config = {
      extends: ["config:recommended"],
      packageRules: [{ groupName: "existing", matchFileNames: ["src/app/**"] }],
      prHourlyLimit: 3,
    };
    const source = imageObservation("example/app", ["v1.2.0-fips"]);
    source.flavor = "app";

    const result = appendConstraints(config, snapshot(source));

    expect(result).toEqual({
      ...config,
      packageRules: [
        ...config.packageRules,
        {
          matchDatasources: ["docker"],
          matchPackageNames: ["example/app"],
          matchFileNames: [pin.file],
          matchCurrentValue: "/^v1\\.0\\.0-fips$/",
          allowedVersions: "/^v1\\.2\\.0-fips$/",
        },
      ],
    });
    expect(config.packageRules).toHaveLength(1);
  });

  it("holds different versions in the same file independently without restricting unrelated packages", async () => {
    const source = imageObservation("example/app", ["v0.9.0-fips"]);
    source.flavor = "app";
    source.current.push({ ...pin, currentValue: "v1.1.0-fips", version: "1.1.0" });

    const config = appendConstraints({}, snapshot(source));

    expect(config.packageRules.map(rule => [rule.matchCurrentValue, rule.allowedVersions])).toEqual(
      [
        ["/^v1\\.0\\.0-fips$/", "/^v1\\.0\\.0-fips$/"],
        ["/^v1\\.1\\.0-fips$/", "/^v1\\.1\\.0-fips$/"],
      ],
    );

    const rules = await readVersionRules(config);
    const candidate = { tag: "v1.1.0-fips", version: "1.1.0", eligible: true };

    expect(
      isEligibleRelease(
        source.current[0],
        candidate,
        restrictionsForPin(dependency, source.current[0], rules),
      ),
    ).toBe(false);
    expect(
      isEligibleRelease(
        source.current[1],
        candidate,
        restrictionsForPin(dependency, source.current[1], rules),
      ),
    ).toBe(true);
    expect(
      isEligibleRelease(
        pin,
        candidate,
        restrictionsForPin({ ...dependency, packageName: "unrelated/app" }, pin, rules),
      ),
    ).toBe(true);
  });

  it.each([
    { tag: "v1.2.0", expectedTag: "v1.2.0", allowed: "/^1\\.2\\.0$/" },
    { tag: "v1.0.0", expectedTag: "1.0.0", allowed: "/^1\\.0\\.0$/" },
  ])(
    "constrains the extracted source value for publisher tag $tag",
    ({ tag, expectedTag, allowed }) => {
      const source = buildDependencyObservation(
        {
          datasource: "github-tags",
          packageName: "example/app",
          tagPattern: "^v(?<version>\\d+\\.\\d+\\.\\d+)$",
        },
        "app",
        [
          {
            file: "src/app/tasks.yaml",
            currentValue: "1.0.0",
            extractVersion: "^v(?<version>.*)$",
          },
        ],
        [{ tag, eligible: true }],
      );

      const input = snapshot(source);

      expect(input.families[0].targets[0].tag).toBe(expectedTag);
      expect(appendConstraints({}, input).packageRules[0].allowedVersions).toBe(allowed);
    },
  );
});

describe("version restrictions", () => {
  it.each([
    { selector: "/^EXAMPLE\\/APP$/i", expected: false },
    { selector: "EXAMPLE/*", expected: false },
    { selector: "!/^EXAMPLE\\/APP$/i", expected: true },
  ])("preserves case-insensitive selector policy: $selector", async ({ selector, expected }) => {
    const rules = await readVersionRules({
      packageRules: [{ matchPackageNames: [selector], allowedVersions: "<1.1.0" }],
    });
    const current = { ...pin, currentValue: "1.0.0" };
    const candidate = { ...release, tag: "1.2.0" };

    expect(
      isEligibleRelease(current, candidate, restrictionsForPin(dependency, current, rules)),
    ).toBe(expected);
  });

  it.each(["v1.2.0-fips", "distroless-v1.2.0"])(
    "rejects semver bounds that normalize away publisher tag semantics: %s",
    tag => {
      expect(() => isEligibleRelease(pin, { ...release, tag }, { allowedVersions: "<2" })).toThrow(
        /unsupported/i,
      );
    },
  );

  it("supports semver bounds when extractVersion preserves Renovate's evaluated value", () => {
    const current = {
      ...pin,
      currentValue: "1.0.0",
      extractVersion: "^v(?<version>.*)-fips$",
    };

    expect(isEligibleRelease(current, release, { allowedVersions: "<2" })).toBe(true);
    expect(isEligibleRelease(current, release, { allowedVersions: "<1.1.0" })).toBe(false);
  });

  it("applies inherited ranges before scoped local overrides", async () => {
    const candidate = { ...release, tag: "v1.2.0" };
    const inherited = async () =>
      '{ extends: ["config:base"], packageRules: [{ matchPackageNames: ["example/*"], allowedVersions: "<1.2.0" }] }';
    const rules = await readVersionRules({ extends: [preset] }, inherited);

    expect(isEligibleRelease(pin, candidate, restrictionsForPin(dependency, pin, rules))).toBe(
      false,
    );

    const local = await readVersionRules(
      {
        extends: [preset],
        packageRules: [
          { matchPackageNames: ["example/app"], allowedVersions: "<2" },
          { matchFileNames: ["other/**"], allowedVersions: "<1" },
        ],
      },
      inherited,
    );

    expect(isEligibleRelease(pin, candidate, restrictionsForPin(dependency, pin, local))).toBe(
      true,
    );
  });

  it("enforces inherited timestamp requirements and the three-day plus thirty-minute age boundary", async () => {
    const rules = await readVersionRules({ extends: [preset] }, readPresetFixture);
    const policy = restrictionsForPin({ ...dependency, datasource: "github-tags" }, pin, rules);
    const now = Date.parse("2026-11-12T12:00:00Z");

    for (const [releaseTimestamp, expected] of [
      [undefined, false],
      ["2026-11-09T11:45:00Z", false],
      ["2026-11-09T11:30:00Z", true],
    ] as const)
      expect(isEligibleRelease(pin, { ...release, releaseTimestamp }, policy, now)).toBe(expected);
  });

  it("respects datasource/package exclusions and explicit age exemptions", async () => {
    const rules = await readVersionRules({ extends: [preset] }, readPresetFixture);

    expect(isEligibleRelease(pin, release, restrictionsForPin(dependency, pin, rules))).toBe(true);
    expect(
      isEligibleRelease(
        pin,
        release,
        restrictionsForPin(
          { ...dependency, datasource: "github-tags", packageName: "defenseunicorns/app" },
          pin,
          rules,
        ),
      ),
    ).toBe(true);

    const exempt = await readVersionRules(
      {
        extends: [preset],
        packageRules: [{ matchPackageNames: ["example/app"], minimumReleaseAge: null }],
      },
      readPresetFixture,
    );

    expect(
      isEligibleRelease(
        pin,
        release,
        restrictionsForPin({ ...dependency, datasource: "github-tags" }, pin, exempt),
      ),
    ).toBe(true);
  });

  it.each([
    { allowedVersions: "!/^v1\\.2\\.0-fips$/", extractVersion: undefined, expected: false },
    { allowedVersions: "/^1\\.2\\.0$/", extractVersion: "^v(?<version>.*)-fips$", expected: true },
  ])(
    "matches allowedVersions against the correct tag representation: $allowedVersions",
    async ({ allowedVersions, extractVersion, expected }) => {
      const current = extractVersion ? { ...pin, currentValue: "1.0.0", extractVersion } : pin;
      const rules = await readVersionRules({ allowedVersions });

      expect(
        isEligibleRelease(current, release, restrictionsForPin(dependency, current, rules)),
      ).toBe(expected);
    },
  );

  it("rejects release candidates when updates are disabled", async () => {
    const rules = await readVersionRules({ enabled: false });

    expect(isEligibleRelease(pin, release, restrictionsForPin(dependency, pin, rules))).toBe(false);
  });

  it("honors prerelease policy for both version suffixes and publisher flags", async () => {
    const rules = await readVersionRules({ ignoreUnstable: false });
    const allowed = restrictionsForPin(dependency, pin, rules);

    for (const candidate of [
      { ...release, tag: "v1.3.0-rc.1-fips", version: "1.3.0-rc.1" },
      { ...release, isPrerelease: true },
    ]) {
      expect(isEligibleRelease(pin, candidate, {})).toBe(false);
      expect(isEligibleRelease(pin, candidate, allowed)).toBe(true);
    }
  });

  it.each([
    {
      name: "unsupported selectors",
      rule: { matchPackageNames: ["example/app"], matchJsonata: ["true"], allowedVersions: "<2" },
    },
    {
      name: "templated bounds",
      rule: { matchPackageNames: ["example/app"], allowedVersions: "/^v{{major}}.*$/" },
    },
  ])("rejects $name only for affected dependencies", async ({ rule }) => {
    const rules = await readVersionRules({ packageRules: [rule] });

    expect(() =>
      isEligibleRelease(pin, release, restrictionsForPin(dependency, pin, rules)),
    ).toThrow(/unsupported/i);
    expect(
      isEligibleRelease(
        pin,
        release,
        restrictionsForPin({ ...dependency, packageName: "unrelated/app" }, pin, rules),
      ),
    ).toBe(true);
  });

  it("refuses to select without all inherited restriction inputs", async () => {
    await expect(readVersionRules({ extends: ["config:unknown"] })).rejects.toThrow(
      /unsupported preset/i,
    );

    await expect(
      readVersionRules({ extends: [preset] }, async () => {
        throw new Error("unavailable preset");
      }),
    ).rejects.toThrow(/unavailable preset/i);
  });
});
