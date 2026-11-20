// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import { execFile, execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as semver from "semver";
import * as yaml from "yaml";
import { discover, main } from "./discover-versions";
import { createCliVersionSources, type RunCommand, type VersionSources } from "./publisher-sources";
import {
  appendConstraints,
  inventoryPins,
  buildDependencyObservation,
  parseFamilies,
  type Family,
} from "./shared-releases";

const family: Family = {
  name: "app",
  sourceFiles: ["src/app/zarf.yaml"],
  appDependency: {
    datasource: "docker",
    packageName: "example.com/app",
    tagPattern: "^v(?<version>\\d+\\.\\d+\\.\\d+)$",
  },
  flavors: {
    upstream: {
      images: [{ repository: "example.com/app", tagPattern: "^v(?<version>\\d+\\.\\d+\\.\\d+)$" }],
    },
  },
};
const files = {
  "src/app/zarf.yaml": "components:\n  - name: app\n    images: [example.com/app:v1.0.0]\n",
};
const filesWithMixedPins = {
  "src/app/zarf.yaml":
    "components:\n  - name: app\n    images: [example.com/app:v1.0.0, example.com/app:v1.1.0]\n",
};
const controlled: VersionSources = {
  readPreset: async () => "{}",
  lookup: async () => [{ tag: "v1.1.0", eligible: true }],
};

const root = resolve(__dirname, "../..");
const readPresetFixture = () =>
  readFile(resolve(__dirname, "fixtures/uds-common-selection.json5"), "utf8");

describe("inventory and discovery", () => {
  it("reads every distinct image pin without using chart versions", () => {
    const content =
      "components:\n  - name: app\n    charts: [{name: app, version: 99.0.0}]\n    images: [example.com/app:v1.0.0, example.com/app:v1.1.0, example.com/app:v1.0.0]\n";

    expect(
      inventoryPins(family.appDependency, "src/app/zarf.yaml", content).map(
        pin => pin.currentValue,
      ),
    ).toEqual(["v1.0.0", "v1.1.0"]);
  });

  it("reads generation annotations and literal GitHub versions, not interpolated URLs", () => {
    const dependency = {
      datasource: "github-tags" as const,
      packageName: "istio/istio",
      tagPattern: "^(?<version>\\d+\\.\\d+\\.\\d+)$",
    };
    const content =
      '# renovate: datasource=github-tags depName=istio/istio versioning=semver extractVersion=^v(?<version>.*)$\nISTIO_VERSION="1.2.3" npx foo\nurl: https://raw.githubusercontent.com/istio/istio/1.2.4/foo.yaml\nurl: https://raw.githubusercontent.com/istio/istio/${ISTIO_VERSION}/foo.yaml\n';

    expect(inventoryPins(dependency, "src/pepr/tasks.yaml", content)).toEqual([
      {
        file: "src/pepr/tasks.yaml",
        currentValue: "1.2.3",
        extractVersion: "^v(?<version>.*)$",
        versioning: "semver",
      },
      { file: "src/pepr/tasks.yaml", currentValue: "1.2.4", versioning: "semver-coerced" },
    ]);
  });

  it("reads only matching annotated chart versions, not appVersion or unrelated dependencies", () => {
    const file = "src/app/chart/Chart.yaml";
    const content = [
      "apiVersion: v2",
      "name: app",
      "# renovate: datasource=docker depName=example.com/app versioning=semver",
      'version: "v1.0.0"',
      "appVersion: 99.0.0",
      "dependencies:",
      "  - name: unrelated",
      "    # renovate: datasource=docker depName=example.com/unrelated versioning=semver",
      "    version: 88.0.0",
    ].join("\n");

    expect(inventoryPins(family.appDependency, file, content)).toEqual([
      { file, currentValue: "v1.0.0", versioning: "semver" },
    ]);
  });

  it.each([
    { scenario: "holds chart pins when Unicorn lacks the newer release", sharedUpgrade: false },
    {
      scenario: "updates chart pins when every publisher has the newer release",
      sharedUpgrade: true,
    },
  ])("Keycloak $scenario", async ({ sharedUpgrade }) => {
    const manifest = parseFamilies(await readFile(join(root, "app-families.yaml"), "utf8"));
    const keycloak = manifest.find(family => family.name === "keycloak")!;
    const sourceFiles = [
      "src/keycloak/zarf.yaml",
      "src/keycloak/chart/Chart.yaml",
      "src/keycloak/common/zarf.yaml",
    ];
    const contents: Record<string, string> = {};
    for (const file of sourceFiles) contents[file] = await readFile(join(root, file), "utf8");
    const currentVersion = yaml.parse(contents["src/keycloak/chart/Chart.yaml"]).version as string;
    const nextVersion = semver.inc(currentVersion, "patch")!;
    const registry1 = keycloak.flavors.registry1.images[0].repository;
    const unicorn = keycloak.flavors.unicorn.images[0].repository;
    const snapshot = await discover(
      [keycloak],
      contents,
      {},
      {
        ...controlled,
        lookup: async dependency => {
          const versions =
            dependency.packageName === unicorn && !sharedUpgrade
              ? [currentVersion]
              : [currentVersion, nextVersion];
          return versions.map(version => ({
            tag:
              dependency.packageName === registry1
                ? `${version}-fips`
                : dependency.packageName === unicorn
                  ? `v${version}`
                  : version,
            eligible: true,
          }));
        },
      },
      "a".repeat(40),
    );
    const targetVersion = sharedUpgrade ? nextVersion : currentVersion;
    const currentPattern = currentVersion.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const targetPattern = targetVersion.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const rules = appendConstraints({}, snapshot.families).packageRules;

    expect(snapshot.families[0].status).toBe(sharedUpgrade ? "update-available" : "current");
    expect(rules).toHaveLength(5);
    expect(rules).toEqual(
      expect.arrayContaining([
        ...sourceFiles.map(file => ({
          matchDatasources: ["docker"],
          matchPackageNames: ["quay.io/keycloak/keycloak"],
          matchFileNames: [file],
          matchCurrentValue: `/^${currentPattern}$/`,
          allowedVersions: `/^${targetPattern}$/`,
        })),
        expect.objectContaining({
          matchPackageNames: [registry1],
          allowedVersions: `/^${targetPattern}-fips$/`,
        }),
        expect.objectContaining({
          matchPackageNames: [unicorn],
          allowedVersions: `/^v${targetPattern}$/`,
        }),
      ]),
    );
  });

  it("applies app age and image version bounds without inventing publisher gaps", async () => {
    const github: Family = {
      ...family,
      sourceFiles: [...family.sourceFiles, "src/app/tasks.yaml"],
      appDependency: {
        ...family.appDependency,
        datasource: "github-tags",
        packageName: "example/app",
      },
    };

    const snapshot = await discover(
      [github],
      {
        ...files,
        "src/app/tasks.yaml":
          '# renovate: datasource=github-tags depName=example/app\nAPP_VERSION="v1.0.0"\n',
      },
      {
        extends: ["github>defenseunicorns/uds-common//config/renovate.json5"],
        packageRules: [{ matchDatasources: ["docker"], allowedVersions: "!/^v1\\.2\\.0$/" }],
      },
      {
        readPreset: readPresetFixture,
        lookup: async () => [
          { tag: "v1.1.0", eligible: true, releaseTimestamp: "2020-01-01T00:00:00Z" },
          { tag: "v1.2.0", eligible: true, releaseTimestamp: "2020-01-01T00:00:00Z" },
          { tag: "v1.3.0", eligible: true, releaseTimestamp: new Date().toISOString() },
        ],
      },
      "a".repeat(40),
    );

    expect(snapshot.families[0].selectedRelease).toBe("1.1.0");
    expect(snapshot.families[0].dependencies[0].latestVersion).toBe("1.3.0");
    expect(snapshot.families[0].publisherGaps).toEqual([]);
  });

  it("resolves restrictions once per current pin across release candidates", async () => {
    const resolveRestrictions = vi.spyOn(await import("./shared-releases"), "restrictionsForPin");
    const snapshot = await discover(
      [{ ...family, flavors: {} }],
      filesWithMixedPins,
      {
        packageRules: [{ matchCurrentValue: "/^v1\\.0\\.0$/", allowedVersions: "<1.2" }],
      },
      {
        ...controlled,
        lookup: async () => ["v1.1.0", "v1.2.0", "v1.3.0"].map(tag => ({ tag, eligible: true })),
      },
      "a".repeat(40),
    );

    expect(snapshot.families[0].selectedRelease).toBe("1.1.0");
    expect(resolveRestrictions).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "skips later-pin rules when every candidate is already rejected",
      bound: "<1",
      status: "no-shared-release",
    },
    {
      name: "rejects unsupported later-pin rules once a candidate reaches that pin",
      bound: "<1.2",
      status: "unsupported",
    },
  ])("$name", async ({ bound, status }) => {
    const snapshot = await discover(
      [{ ...family, flavors: {} }],
      filesWithMixedPins,
      {
        packageRules: [
          { matchCurrentValue: "/^v1\\.0\\.0$/", allowedVersions: bound },
          { matchCurrentValue: "/^v1\\.1\\.0$/", followTag: "latest" },
        ],
      },
      {
        ...controlled,
        lookup: async () => ["v1.1.0", "v1.2.0", "v1.3.0"].map(tag => ({ tag, eligible: true })),
      },
      "a".repeat(40),
    );

    const result = snapshot.families[0];
    expect(result.status).toBe(status);
    expect(result.dependencies[0].releases.every(release => !release.eligible)).toBe(true);
    expect(result.targets.map(target => target.tag)).toEqual(["v1.0.0", "v1.1.0"]);
  });

  it("selects an upgrade when the source pin omits the publisher prefix", async () => {
    const sourceOnly: Family = {
      ...family,
      sourceFiles: ["src/app/tasks.yaml"],
      appDependency: {
        ...family.appDependency,
        datasource: "github-tags",
        packageName: "example/app",
      },
      flavors: {},
    };

    const snapshot = await discover(
      [sourceOnly],
      {
        "src/app/tasks.yaml":
          '# renovate: datasource=github-tags depName=example/app extractVersion=^v(?<version>.*)$\ndefault: "1.0.0"\n',
      },
      {},
      controlled,
      "a".repeat(40),
    );

    expect(snapshot.families[0].selectedRelease).toBe("1.1.0");
    expect(snapshot.families[0].targets[0].tag).toBe("v1.1.0");
    expect(appendConstraints({}, snapshot.families).packageRules[0].allowedVersions).toBe(
      "/^1\\.1\\.0$/",
    );
  });

  it("finds comparable current pins for every dependency declared in the repository manifest", async () => {
    const families = parseFamilies(await readFile(join(root, "app-families.yaml"), "utf8"));
    const contents: Record<string, string> = {};
    for (const file of new Set(families.flatMap(family => family.sourceFiles)))
      contents[file] = await readFile(join(root, file), "utf8");

    for (const family of families) {
      const dependencies = [
        family.appDependency,
        ...Object.values(family.flavors).flatMap(flavor =>
          flavor.images.map(image => ({
            datasource: "docker" as const,
            packageName: image.repository,
            tagPattern: image.tagPattern,
          })),
        ),
      ];

      for (const dependency of dependencies) {
        const pins = family.sourceFiles.flatMap(file =>
          inventoryPins(dependency, file, contents[file]),
        );
        const label = `${family.name}: ${dependency.packageName}`;

        expect(pins.length, label).toBeGreaterThan(0);
        // Current pins must remain comparable even without publisher data.
        expect(
          buildDependencyObservation(dependency, "app", pins, []).current.every(pin => pin.version),
          label,
        ).toBe(true);
      }
    }
  });
});

const workspaces: string[] = [];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(workspaces.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createDiscoveryWorkspace() {
  const directory = await mkdtemp(join(tmpdir(), "discover-cli-"));
  workspaces.push(directory);
  // Supply a real HEAD without checking out repo files; source/config fixtures stay controlled.
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", root, directory], {
    timeout: 5_000,
  });

  await mkdir(join(directory, "src/app"), { recursive: true });
  await writeFile(join(directory, "src/app/zarf.yaml"), files["src/app/zarf.yaml"]);

  const manifest = join(directory, "app-families.yaml");
  const configFile = join(directory, "renovate.json");
  const output = join(directory, "snapshot.json");
  const original = JSON.stringify({
    packageRules: [{ groupName: "preserved", matchFileNames: ["src/other/**"] }],
  });
  await writeFile(manifest, JSON.stringify({ families: [family] }));
  await writeFile(configFile, original);

  const scriptDirectory = join(directory, "scripts/renovate");
  await mkdir(scriptDirectory, { recursive: true });
  const script = join(scriptDirectory, "discover-versions.ts");
  for (const file of ["discover-versions.ts", "publisher-sources.ts", "shared-releases.ts"])
    await copyFile(join(__dirname, file), join(scriptDirectory, file));
  await symlink(join(__dirname, "node_modules"), join(scriptDirectory, "node_modules"), "dir");

  return {
    directory,
    script,
    manifest,
    configFile,
    output,
    original,
    main: (args: string[], sources: VersionSources) => main(args, sources, directory),
    args: ["--families-file", manifest, "--config", configFile, "--report", output],
  };
}

async function runDiscoveryCliWithFakeCrane(
  script: string,
  args: string[],
  cwd: string,
  directory: string,
) {
  const bin = join(directory, "bin");
  await mkdir(bin);
  await writeFile(join(bin, "crane"), "#!/bin/sh\nprintf '%s\\n' v1.1.0\n", { mode: 0o700 });
  return spawnSync(resolve(__dirname, "node_modules/.bin/tsx"), [script, ...args], {
    cwd,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    encoding: "utf8",
    timeout: 15_000,
  });
}

describe("discovery command", { timeout: 20_000 }, () => {
  it.each(["root", "script directory", "outside checkout"])(
    "resolves default inputs from the script checkout when invoked from %s",
    async location => {
      const test = await createDiscoveryWorkspace();
      const caller = await createDiscoveryWorkspace();
      await writeFile(caller.manifest, "{}");
      await writeFile(caller.configFile, '{"followTag":"latest"}');
      await writeFile(join(caller.directory, "src/app/zarf.yaml"), "components: []");
      await writeFile(test.configFile, '{"allowedVersions":"<1"}');
      const cwd =
        location === "root"
          ? test.directory
          : location === "script directory"
            ? join(test.directory, "scripts/renovate")
            : caller.directory;

      const result = await runDiscoveryCliWithFakeCrane(
        test.script,
        ["--report", test.output],
        cwd,
        test.directory,
      );

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(await readFile(test.output, "utf8")).families[0]).toMatchObject({
        name: "app",
        status: "no-shared-release",
        targets: [{ pin: { currentValue: "v1.0.0" }, tag: "v1.0.0" }],
      });
      expect(await readFile(test.configFile, "utf8")).toBe('{"allowedVersions":"<1"}');
    },
  );

  it("resolves explicit relative paths from the caller but source files from the script checkout", async () => {
    const test = await createDiscoveryWorkspace();
    const caller = await createDiscoveryWorkspace();
    await mkdir(join(caller.directory, "inputs"));
    await copyFile(caller.manifest, join(caller.directory, "inputs/focused.yaml"));
    await writeFile(join(caller.directory, "inputs/config.json"), '{"allowedVersions":"<1"}');
    await writeFile(join(caller.directory, "src/app/zarf.yaml"), "components: []");

    const result = await runDiscoveryCliWithFakeCrane(
      test.script,
      [
        "--families-file",
        "inputs/focused.yaml",
        "--config",
        "inputs/config.json",
        "--report",
        "report.json",
        "--write-config",
      ],
      caller.directory,
      test.directory,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(
      JSON.parse(await readFile(join(caller.directory, "report.json"), "utf8")).families[0].status,
    ).toBe("no-shared-release");
    expect(
      JSON.parse(await readFile(join(caller.directory, "inputs/config.json"), "utf8"))
        .packageRules[0].allowedVersions,
    ).toBe("/^v1\\.0\\.0$/");
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
    expect(await readFile(caller.configFile, "utf8")).toBe(caller.original);
  });

  it("generates constraints against a temporary copy without modifying the canonical config", async () => {
    const test = await createDiscoveryWorkspace();
    const canonical = join(root, "renovate.json");
    const original = await readFile(canonical, "utf8");
    await writeFile(test.configFile, original);

    expect(
      await test.main([...test.args, "--write-config"], {
        ...controlled,
        readPreset: readPresetFixture,
      }),
    ).toBe(0);

    const config = JSON.parse(await readFile(test.configFile, "utf8"));
    expect(config.packageRules.slice(0, -1)).toEqual(JSON.parse(original).packageRules);
    expect(config.packageRules.at(-1).allowedVersions).toBe("/^v1\\.1\\.0$/");
    expect(await readFile(canonical, "utf8")).toBe(original);
  });

  it("rejects the removed repo-root option before writing outputs", async () => {
    const test = await createDiscoveryWorkspace();

    await expect(
      test.main([...test.args, "--repo-root", test.directory], controlled),
    ).rejects.toThrow(/Unknown option/);
    await expect(readFile(test.output, "utf8")).rejects.toThrow();
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
  });

  it("writes config only when requested, preserving existing rules and sharing publisher lookups across roles", async () => {
    const test = await createDiscoveryWorkspace();
    let lookups = 0;
    let logAtLookup = "";
    const sources: VersionSources = {
      ...controlled,
      lookup: async dependency => {
        lookups++;
        logAtLookup = vi.mocked(console.error).mock.calls.flat().join("\n");
        return controlled.lookup(dependency);
      },
    };

    expect(await test.main(test.args, sources)).toBe(0);
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
    expect(lookups).toBe(1);
    expect(logAtLookup).toContain("Lookup started docker:example.com/app");

    const logs = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(logs).toContain("families=1");
    expect(logs).toContain("Lookup complete docker:example.com/app: tags=1");
    expect(logs).toContain("app: update-available selected=1.1.0");
    expect(logs).toContain("Summary: update-available=1");
    expect(logs).toContain(`Discovery report written: ${test.output}`);
    expect(logs).toContain("Config unchanged (--write-config not requested)");

    const snapshot = JSON.parse(await readFile(test.output, "utf8"));
    expect(snapshot.mainSha).toBe(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: test.directory,
        encoding: "utf8",
        timeout: 5_000,
      }).trim(),
    );
    expect(
      snapshot.families[0].dependencies.map((dependency: { flavor: string }) => dependency.flavor),
    ).toEqual(["app", "upstream"]);

    expect(await test.main([...test.args, "--write-config"], sources)).toBe(0);

    const config = JSON.parse(await readFile(test.configFile, "utf8"));
    expect(config.packageRules).toHaveLength(2);
    expect(config.packageRules[0]).toEqual(JSON.parse(test.original).packageRules[0]);
    expect(config.packageRules[1].allowedVersions).toBe("/^v1\\.1\\.0$/");
    expect(vi.mocked(console.error).mock.calls.flat().join("\n")).toContain(
      `Config written: ${test.configFile}`,
    );
  });

  it("treats a legitimate held selection as success and writes current-pin constraints", async () => {
    const test = await createDiscoveryWorkspace();
    await writeFile(test.configFile, '{"allowedVersions":"<1"}');

    expect(await test.main([...test.args, "--write-config"], controlled)).toBe(0);
    expect(JSON.parse(await readFile(test.output, "utf8")).families[0].status).toBe(
      "no-shared-release",
    );
    expect(
      JSON.parse(await readFile(test.configFile, "utf8")).packageRules[0].allowedVersions,
    ).toBe("/^v1\\.0\\.0$/");
  });

  it.each(["lookup-failed", "unsupported", "missing-pin", "invalid-data"])(
    "returns diagnostics without changing config for %s",
    async status => {
      const test = await createDiscoveryWorkspace();
      if (status === "unsupported") await writeFile(test.configFile, '{"followTag":"latest"}');
      if (status === "missing-pin")
        await writeFile(join(test.directory, "src/app/zarf.yaml"), "components: []");
      if (status === "invalid-data")
        await writeFile(
          join(test.directory, "src/app/zarf.yaml"),
          files["src/app/zarf.yaml"].replace("v1.0.0", "not-a-version"),
        );

      const original = await readFile(test.configFile, "utf8");
      const sources =
        status === "lookup-failed"
          ? {
              ...controlled,
              lookup: async () => {
                throw new Error("private response");
              },
            }
          : controlled;

      expect(await test.main([...test.args, "--write-config"], sources)).toBe(2);
      expect(await readFile(test.configFile, "utf8")).toBe(original);

      const result = JSON.parse(await readFile(test.output, "utf8")).families[0];
      expect(result.status).toBe(status);
      expect(result.publisherGaps).toEqual([]);
      expect(
        result.targets.every(
          (target: { tag: string; pin: { currentValue: string } }) =>
            target.tag === target.pin.currentValue,
        ),
      ).toBe(true);
      const logs = vi.mocked(console.error).mock.calls.flat().join("\n");
      expect(logs).toContain(`app: ${status}`);
      expect(logs).toContain(`Summary: ${status}=1`);
      expect(logs).toContain("[discovery] Failed families:");
      const recap = logs.slice(logs.indexOf("[discovery] Failed families:"));
      expect(recap).toContain(`app: ${status}`);
      expect(recap).toContain(`docker:example.com/app: ${status} [app, upstream]`);
      expect(recap.match(/docker:example\.com\/app/g)).toHaveLength(1);
      expect(logs).toContain("Config unchanged because discovery failed: family-errors=1");
      expect(logs).not.toContain("private response");
      if (status === "lookup-failed")
        expect(JSON.stringify(result)).not.toContain("private response");
    },
  );

  it.each([
    {
      failure: { code: 1, stderr: "HTTP 401 TOP_SECRET raw-response" },
      details: ["exit=1", "http=401"],
    },
    {
      failure: { code: 1, stderr: "status code: 429 TOP_SECRET raw-response" },
      details: ["exit=1", "http=429"],
    },
    { failure: { code: "ENOENT", stderr: "TOP_SECRET" }, details: ["code=ENOENT"] },
    {
      failure: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", stderr: "TOP_SECRET" },
      details: ["code=ERR_CHILD_PROCESS_STDIO_MAXBUFFER"],
    },
    {
      failure: { code: null, signal: "SIGTERM", stderr: "TOP_SECRET" },
      details: ["signal=SIGTERM"],
    },
    {
      failure: { code: "TOP_SECRET", signal: "TOP_SECRET", stderr: "TOP_SECRET raw-response" },
      details: ["details unavailable"],
    },
  ])("logs only safe publisher failure metadata: $details", async ({ failure, details }) => {
    const test = await createDiscoveryWorkspace();
    const sources = createCliVersionSources(async () => {
      throw Object.assign(new Error("TOP_SECRET raw-response"), failure);
    });

    expect(await test.main([...test.args, "--write-config"], sources)).toBe(2);

    const logs = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(logs).toContain("Lookup failed docker:example.com/app");
    expect(logs).toContain("command=crane");
    for (const detail of details) expect(logs).toContain(detail);
    expect(logs).not.toContain("TOP_SECRET");
    expect(logs).not.toContain("raw-response");
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
    const result = JSON.parse(await readFile(test.output, "utf8"));
    expect(result.schemaVersion).toBe(2);
    expect(result.families[0].dependencies[0].error).toEqual({
      kind: "lookup-failed",
      message: "Publisher lookup failed: docker:example.com/app",
    });
    expect(JSON.stringify(result)).not.toContain("TOP_SECRET");
  });

  it("reports safe preset failure context without writing outputs", async () => {
    const test = await createDiscoveryWorkspace();
    await writeFile(
      test.configFile,
      JSON.stringify({ extends: ["github>example/presets//renovate.json5"] }),
    );
    const original = await readFile(test.configFile, "utf8");
    const sources = createCliVersionSources(async () => {
      throw Object.assign(new Error("TOP_SECRET"), {
        code: 1,
        stderr: "gh: TOP_SECRET (HTTP 403)",
      });
    });

    await expect(test.main([...test.args, "--write-config"], sources)).rejects.toThrow(
      /Cannot read selection preset/,
    );

    const logs = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(logs).toContain("Reading preset github>example/presets//renovate.json5");
    expect(logs).toContain("Preset lookup failed");
    expect(logs).toContain("command=gh");
    expect(logs).toContain("exit=1");
    expect(logs).toContain("http=403");
    expect(logs).not.toContain("TOP_SECRET");
    expect(await readFile(test.configFile, "utf8")).toBe(original);
    await expect(readFile(test.output, "utf8")).rejects.toThrow();
  });

  it("reports command failures safely on stderr and continues without writing partial config", async () => {
    const test = await createDiscoveryWorkspace();
    const other: Family = {
      ...family,
      name: "other",
      appDependency: { ...family.appDependency, packageName: "example.com/other" },
      flavors: {},
    };
    const broken: Family = {
      ...other,
      name: "broken",
      appDependency: { ...family.appDependency, packageName: "example.com/broken" },
    };
    await writeFile(test.manifest, JSON.stringify({ families: [family, other, broken] }));
    await writeFile(
      join(test.directory, "src/app/zarf.yaml"),
      "components:\n  - name: app\n    images: [example.com/app:v1.0.0, example.com/other:v1.0.0, example.com/broken:v1.0.0]\n",
    );
    const bin = join(test.directory, "bin");
    await mkdir(bin);
    // Replace publisher I/O only; the real entrypoint still owns files, exit codes, and stderr.
    await writeFile(
      join(bin, "crane"),
      "#!/bin/sh\nif [ \"$2\" = example.com/other ]; then\n  printf '%s\\n' v1.1.0\n  exit 0\nfi\nprintf '%s\\n' 'HTTP 429 TOP_SECRET raw-response' >&2\nexit 1\n",
      { mode: 0o700 },
    );

    const result = spawnSync(
      resolve(__dirname, "node_modules/.bin/tsx"),
      [test.script, ...test.args, "--write-config"],
      {
        cwd: __dirname,
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
        encoding: "utf8",
        timeout: 15_000,
      },
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("command=crane");
    expect(result.stderr).toContain("exit=1");
    expect(result.stderr).toContain("http=429");
    expect(result.stderr).toContain("app: lookup-failed");
    expect(result.stderr).toContain("other: update-available selected=1.1.0");
    expect(result.stderr).toContain("Summary: lookup-failed=2 update-available=1");
    expect(result.stderr).toContain("[discovery] Failed families:");
    const recap = result.stderr.slice(result.stderr.indexOf("[discovery] Failed families:"));
    expect(recap).toContain("app: lookup-failed");
    expect(recap).toContain("docker:example.com/app: lookup-failed [app, upstream]");
    expect(recap).toContain("broken: lookup-failed");
    expect(recap).toContain("docker:example.com/broken: lookup-failed [app]");
    expect(recap).not.toContain("other:");
    expect(result.stderr).toContain(`Discovery report written: ${test.output}`);
    expect(result.stderr).toContain("Config unchanged because discovery failed");
    expect(result.stderr).not.toContain("TOP_SECRET");
    expect(result.stderr).not.toContain("raw-response");
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
  });

  it("leaves config unchanged when semver bounds cannot preserve publisher tag semantics", async () => {
    const test = await createDiscoveryWorkspace();
    const original = JSON.stringify({
      packageRules: [
        { matchPackageNames: [family.appDependency.packageName], allowedVersions: "<2" },
      ],
    });
    await writeFile(test.configFile, original);
    await writeFile(
      test.manifest,
      JSON.stringify({
        families: [
          {
            ...family,
            appDependency: {
              ...family.appDependency,
              tagPattern: "^v(?<version>\\d+\\.\\d+\\.\\d+)-fips$",
            },
            flavors: {},
          },
        ],
      }),
    );
    await writeFile(
      join(test.directory, "src/app/zarf.yaml"),
      "components:\n  - name: app\n    images: [example.com/app:v1.0.0-fips]\n",
    );

    expect(
      await test.main([...test.args, "--write-config"], {
        ...controlled,
        lookup: async () => [{ tag: "v1.2.0-fips", eligible: true }],
      }),
    ).toBe(2);
    const snapshot = JSON.parse(await readFile(test.output, "utf8"));
    expect(snapshot.families[0]).toMatchObject({
      status: "unsupported",
      selectedRelease: null,
      targets: [{ tag: "v1.0.0-fips" }],
    });
    expect(await readFile(test.configFile, "utf8")).toBe(original);
  });

  it("leaves config unchanged if the discovery report cannot be written", async () => {
    const test = await createDiscoveryWorkspace();

    await expect(
      test.main(
        [...test.args, "--report", join(test.directory, "missing/output.json"), "--write-config"],
        controlled,
      ),
    ).rejects.toThrow();
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
  });

  // CI opts in separately so the normal unit suite does not require a Docker daemon.
  it.runIf(process.env.RENOVATE_VALIDATE_CONFIG === "true")(
    "validates generated config and rejects invalid config with Renovate",
    async () => {
      const test = await createDiscoveryWorkspace();
      await writeFile(test.configFile, await readFile(join(root, "renovate.json"), "utf8"));

      expect(
        await test.main([...test.args, "--write-config"], {
          ...controlled,
          readPreset: readPresetFixture,
        }),
      ).toBe(0);
      const config = JSON.parse(await readFile(test.configFile, "utf8"));
      expect(config.packageRules.at(-1).allowedVersions).toBe("/^v1\\.1\\.0$/");
      // The container must read a caller-owned private file without changing its permissions.
      await chmod(test.configFile, 0o600);

      const validate = (timeout: number) =>
        promisify(execFile)(
          "uds",
          [
            "run",
            "--no-progress",
            "-f",
            join(root, "tasks/lint.yaml"),
            "renovate",
            "--with",
            `file=${test.configFile}`,
          ],
          { cwd: root, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 },
        );
      // The first validation may pull the image; the rejection check reuses it.
      const { stdout, stderr } = await validate(300_000);

      expect(`${stdout}${stderr}`).toContain("Config validated successfully against 1 file(s)");

      await writeFile(test.configFile, JSON.stringify({ families: [] }));
      await expect(validate(60_000)).rejects.toMatchObject({ code: 1 });
    },
    420_000,
  );

  it("rejects an invalid manifest before writing the discovery report or config", async () => {
    const test = await createDiscoveryWorkspace();
    await writeFile(
      test.manifest,
      JSON.stringify({
        families: [{ ...family, appDependency: { ...family.appDependency, tagPattern: "(.*)" } }],
      }),
    );

    await expect(test.main([...test.args, "--write-config"], controlled)).rejects.toThrow(
      /pattern/i,
    );
    expect(await readFile(test.configFile, "utf8")).toBe(test.original);
    await expect(readFile(test.output, "utf8")).rejects.toThrow();
  });
});

const github = {
  datasource: "github-tags" as const,
  packageName: "example/app",
  tagPattern: "^(?<version>.*)$",
};

const page = (nodes: object[], hasNextPage: boolean) => ({
  data: {
    repository: {
      refs: { nodes, pageInfo: { hasNextPage, endCursor: hasNextPage ? "next" : null } },
    },
  },
});

describe("container command adapter", () => {
  it("builds the crane tag-list command and parses its output", async () => {
    const commands: string[][] = [];
    const sources = createCliVersionSources(async (command, args) => {
      commands.push([command, ...args]);
      return "v1.0.0\nv1.1.0\n";
    });

    expect(await sources.lookup(family.appDependency)).toEqual([
      { tag: "v1.0.0", eligible: true },
      { tag: "v1.1.0", eligible: true },
    ]);
    expect(commands).toEqual([["crane", "ls", "example.com/app"]]);
  });
});

describe("GitHub command adapter", () => {
  it("requests pagination and combines tag dates with release metadata", async () => {
    const commands: string[][] = [];
    const run: RunCommand = async (command, args) => {
      commands.push([command, ...args]);
      if (args.includes("graphql"))
        return JSON.stringify([
          page([{ name: "1.0.0", target: { committedDate: "2020-01-01T00:00:00Z" } }], true),
          page([{ name: "1.1.0", target: { tagger: { date: "2020-02-01T00:00:00Z" } } }], false),
        ]);
      return '[]\n[{"tag_name":"1.1.0","published_at":"2020-03-01T00:00:00Z","prerelease":true}]\n';
    };

    expect(await createCliVersionSources(run).lookup(github)).toEqual([
      { tag: "1.0.0", eligible: true, releaseTimestamp: "2020-01-01T00:00:00Z" },
      {
        tag: "1.1.0",
        eligible: true,
        releaseTimestamp: "2020-03-01T00:00:00Z",
        isPrerelease: true,
      },
    ]);
    expect(commands[0]).toEqual(expect.arrayContaining(["gh", "--paginate", "--slurp"]));
    expect(commands[0].join(" ")).toContain("after: $endCursor");
    expect(commands[1]).toEqual(
      expect.arrayContaining([
        "gh",
        "repos/example/app/releases?per_page=100",
        "--paginate",
        "--jq",
        "map({tag_name, published_at, prerelease}) | @json",
      ]),
    );
  });

  it("rejects a truncated tag catalog instead of selecting from partial results", async () => {
    const sources = createCliVersionSources(async () =>
      JSON.stringify([page([{ name: "1.0.0", target: {} }], true)]),
    );

    await expect(sources.lookup(github)).rejects.toThrow(/publisher lookup failed/i);
  });

  it("does not substitute an old commit date for an invalid publication date", async () => {
    const sources = createCliVersionSources(async (_command, args) =>
      args.includes("graphql")
        ? JSON.stringify([
            page([{ name: "1.0.0", target: { committedDate: "2020-01-01T00:00:00Z" } }], false),
          ])
        : '[{"tag_name":"1.0.0","published_at":"not-a-date","prerelease":false}]',
    );
    await expect(sources.lookup(github)).rejects.toThrow(/publisher lookup failed/i);
  });

  it("builds the preset-content request and decodes its base64 response", async () => {
    const commands: string[][] = [];
    const sources = createCliVersionSources(async (command, args) => {
      commands.push([command, ...args]);
      return Buffer.from("{ packageRules: [] }").toString("base64");
    });

    expect(
      await sources.readPreset("github>defenseunicorns/uds-common//config/renovate.json5"),
    ).toBe("{ packageRules: [] }");
    expect(commands).toEqual([
      [
        "gh",
        "api",
        "repos/defenseunicorns/uds-common/contents/config/renovate.json5",
        "--jq",
        ".content",
      ],
    ]);
  });
});
