// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  createCliVersionSources,
  safeFailureDetails,
  type VersionSources,
} from "./publisher-sources";
import {
  appendConstraints,
  buildDependencyObservation,
  inventoryPins,
  isEligibleRelease,
  parseFamilies,
  readVersionRules,
  restrictionsForPin,
  selectFamilyRelease,
  type Dependency,
  type Family,
  type Observation,
  type Pin,
  type PublisherRelease,
  type Selection,
  type SelectionConfig,
  type Snapshot,
  type VersionRules,
} from "./shared-releases";

interface FamilyMember {
  dependency: Dependency;
  flavor: string;
}

/**
 * Write a discovery report, then optionally append constraints to the Renovate config.
 * Family errors still produce a report but prevent config writes. Progress uses stderr.
 * The root defaults to this script's checkout; callers can supply an isolated test checkout.
 *
 * @returns 0 for successful discovery (including held releases), or 2 for family errors.
 * @throws Input, preset-resolution, or I/O failures; the executable maps rejections to exit 1.
 */
export async function main(
  args = process.argv.slice(2),
  sources = createCliVersionSources(),
  root = resolve(__dirname, "../.."),
): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      report: { type: "string" },
      "write-config": { type: "boolean", default: false },
      "families-file": { type: "string" },
      config: { type: "string" },
    },
  });
  if (!values.report) throw new Error("--report is required");

  const familiesPath = resolve(values["families-file"] ?? resolve(root, "app-families.yaml"));
  const configPath = resolve(values.config ?? resolve(root, "renovate.json"));
  const mainSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const families = parseFamilies(await readFile(familiesPath, "utf8"));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  console.error(`[discovery] Starting discovery: families=${families.length} HEAD=${mainSha}`);

  const files: Record<string, string> = {};
  for (const file of new Set(families.flatMap(family => family.sourceFiles)))
    files[file] = await readFile(resolve(root, file), "utf8");

  const snapshot = await discover(families, files, config, sources, mainSha);
  await writeFile(values.report, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.error(`[discovery] Discovery report written: ${values.report}`);

  const counts: Record<string, number> = {};
  for (const family of snapshot.families) counts[family.status] = (counts[family.status] ?? 0) + 1;
  console.error(
    `[discovery] Summary: ${Object.entries(counts)
      .map(([status, count]) => `${status}=${count}`)
      .join(" ")}`,
  );

  const errors = snapshot.families.filter(family =>
    ["lookup-failed", "unsupported", "invalid-data", "missing-pin"].includes(family.status),
  );
  if (errors.length) {
    logFamilyFailures(errors);
    console.error(
      `[discovery] Config unchanged because discovery failed: family-errors=${errors.length}; exit=2`,
    );
    return 2;
  }

  if (values["write-config"]) {
    await writeFile(
      configPath,
      `${JSON.stringify(appendConstraints(config, snapshot.families), null, 2)}\n`,
    );
    console.error(`[discovery] Config written: ${configPath}`);
  } else {
    console.error("[discovery] Config unchanged (--write-config not requested)");
  }

  console.error("[discovery] Complete: exit=0");
  return 0;
}

function logFamilyFailures(families: Selection[]): void {
  console.error("[discovery] Failed families:");
  for (const family of families) {
    console.error(`[discovery]   ${family.name}: ${family.status}`);
    const failures = new Map<string, Set<string>>();
    for (const dependency of family.dependencies) {
      const kind =
        dependency.error?.kind ?? (!dependency.current.length ? "missing-pin" : undefined);
      if (!kind) continue;

      const key = `${dependency.datasource}:${dependency.packageName}: ${kind}`;
      if (!failures.has(key)) failures.set(key, new Set());
      failures.get(key)!.add(dependency.flavor);
    }

    for (const [failure, roles] of failures)
      console.error(`[discovery]     ${failure} [${[...roles].join(", ")}]`);
  }
}

/**
 * Inspect declared source contents and select a release for each family.
 * Shares publisher lookups across roles and families, including failed lookups.
 * Dependency failures become observations so discovery can continue; unresolved
 * inherited rules reject the run. Snapshot/config persistence belongs to the caller.
 *
 * @param files Repository-relative source paths mapped to their file contents.
 */
export async function discover(
  families: Family[],
  files: Record<string, string>,
  config: SelectionConfig,
  sources: VersionSources,
  mainSha: string,
): Promise<Snapshot> {
  const rules = await readVersionRules(config, async preset => {
    console.error(`[discovery] Reading preset ${preset}`);
    try {
      return await sources.readPreset(preset);
    } catch (error) {
      console.error(
        `[discovery] Preset lookup failed ${preset} (command=gh, ${safeFailureDetails(error)})`,
      );
      throw error;
    }
  });
  const snapshot: Snapshot = {
    schemaVersion: 2,
    observedAt: new Date().toISOString(),
    mainSha,
    families: [],
  };
  const now = Date.parse(snapshot.observedAt);

  const catalogs = new Map<string, Promise<PublisherRelease[]>>();
  const lookup: VersionSources["lookup"] = dependency => {
    const key = `${dependency.datasource}:${dependency.packageName}`;
    if (!catalogs.has(key)) catalogs.set(key, lookupPublisher(dependency, sources));
    return catalogs.get(key)!;
  };

  for (const family of families) {
    console.error(`[discovery] Inspecting family ${family.name}`);
    const observations: Observation[] = [];
    for (const member of familyMembers(family)) {
      const pins = family.sourceFiles.flatMap(file =>
        inventoryPins(member.dependency, file, files[file]),
      );
      observations.push(await inspectDependency(member, pins, lookup, rules, now));
    }

    const selection = selectFamilyRelease(family.name, observations);
    snapshot.families.push(selection);
    console.error(
      `[discovery] ${family.name}: ${selection.status}${selection.selectedRelease ? ` selected=${selection.selectedRelease}` : ""}`,
    );
  }

  return snapshot;
}

async function lookupPublisher(
  dependency: Dependency,
  sources: VersionSources,
): Promise<PublisherRelease[]> {
  const key = `${dependency.datasource}:${dependency.packageName}`;
  console.error(`[discovery] Lookup started ${key}`);
  try {
    const releases = await sources.lookup(dependency);
    console.error(`[discovery] Lookup complete ${key}: tags=${releases.length}`);
    return releases;
  } catch (error) {
    const command = dependency.datasource === "docker" ? "crane" : "gh";
    console.error(
      `[discovery] Lookup failed ${key} (command=${command}, ${safeFailureDetails(error)})`,
    );
    throw error;
  }
}

function familyMembers(family: Family): FamilyMember[] {
  return [
    { dependency: family.appDependency, flavor: "app" },
    ...Object.entries(family.flavors).flatMap(([flavor, value]) =>
      value.images.map(image => ({
        flavor,
        dependency: {
          datasource: "docker" as const,
          packageName: image.repository,
          tagPattern: image.tagPattern,
        },
      })),
    ),
  ];
}

async function inspectDependency(
  { dependency, flavor }: FamilyMember,
  pins: Pin[],
  lookup: VersionSources["lookup"],
  rules: VersionRules,
  now: number,
): Promise<Observation> {
  let publisherReleases: PublisherRelease[];
  try {
    publisherReleases = await lookup(dependency);
  } catch {
    const observation = buildDependencyObservation(dependency, flavor, pins, []);
    observation.error = {
      kind: "lookup-failed",
      message: `Publisher lookup failed: ${dependency.datasource}:${dependency.packageName}`,
    };
    return observation;
  }

  const observation = buildDependencyObservation(dependency, flavor, pins, publisherReleases);
  if (!observation.error) applyVersionRestrictions(observation, rules, now);

  return observation;
}

function applyVersionRestrictions(
  observation: Observation,
  rules: VersionRules,
  now: number,
): void {
  try {
    // Resolve lazily to preserve short-circuiting when an earlier pin rejects a release.
    const policies = new Map<Pin, ReturnType<typeof restrictionsForPin>>();
    for (const release of observation.releases) {
      release.eligible = observation.current.every(pin => {
        const policy = policies.get(pin) ?? restrictionsForPin(observation, pin, rules);
        policies.set(pin, policy);
        return isEligibleRelease(pin, release, policy, now);
      });
      release.reason = release.eligible ? undefined : "version-policy";
    }
  } catch {
    for (const release of observation.releases) {
      release.eligible = false;
      release.reason = "unsupported-policy";
    }

    observation.error = {
      kind: "unsupported",
      message: `Cannot safely evaluate version policy: ${observation.packageName}`,
    };
  }
}

if (require.main === module) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
