// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import { execFile, execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import JSON5 from "json5";
import { minimatch } from "minimatch";
import * as semver from "semver";
import * as yaml from "yaml";

export interface Dependency {
  datasource: "docker" | "github-tags";
  packageName: string;
  tagPattern: string;
}

export interface Family {
  name: string;
  sourceFiles: string[];
  appDependency: Dependency;
  flavors: Record<string, { images: Array<{ repository: string; tagPattern: string }> }>;
}

interface FamilyMember {
  dependency: Dependency;
  flavor: string;
}

export interface Pin {
  file: string;
  /** Literal source value, which may already omit the publisher's tag prefix. */
  currentValue: string;
  version?: string;
  /** Renovate regex that extracts the source value from a publisher tag. */
  extractVersion?: string;
  versioning?: string;
}

export interface PublisherRelease {
  /** Publisher tag verbatim; normalization must not change the eventual target tag. */
  tag: string;
  eligible: boolean;
  reason?: string;
  releaseTimestamp?: string;
  isPrerelease?: boolean;
}

interface ApplicationRelease extends PublisherRelease {
  version: string;
}

type FailureKind = "lookup-failed" | "unsupported" | "invalid-data" | "missing-pin";

export interface Observation extends Dependency {
  flavor: string;
  current: Pin[];
  releases: ApplicationRelease[];
  /** Newest comparable publisher version, regardless of selection eligibility. */
  latestVersion: string | null;
  latestTags: string[];
  error?: { kind: FailureKind; message: string };
}

interface Target extends Dependency {
  pin: Pin;
  /** Raw publisher tag for an upgrade; unchanged source value for a held selection. */
  tag: string;
}

interface Selection {
  name: string;
  status: FailureKind | "downgrade-blocked" | "no-shared-release" | "current" | "update-available";
  /** Shared normalized version, or null when no safe shared release is selected. */
  selectedRelease: string | null;
  dependencies: Observation[];
  targets: Target[];
  /**
   * Catalog gaps at the app's latest observed version, independent of eligibility.
   * A family can be current while some publishers still lack that newer version.
   */
  publisherGaps: Array<{ flavor: string; packageName: string; missingRelease: string }>;
}

export interface Snapshot {
  schemaVersion: 2;
  observedAt: string;
  /** HEAD recorded by the command; neither branch nor checkout cleanliness is verified. */
  mainSha: string;
  families: Selection[];
}

export interface VersionSources {
  lookup(dependency: Dependency): Promise<PublisherRelease[]>;
  readPreset(preset: string): Promise<string>;
}

interface VersionRestrictions {
  enabled?: boolean;
  ignoreUnstable?: boolean;
  allowedVersions?: string | null;
  minimumReleaseAge?: string | null;
  minimumReleaseAgeBuffer?: string | null;
  minimumReleaseAgeBehaviour?: "timestamp-required" | "timestamp-optional";
}

type Rule = VersionRestrictions & Record<string, unknown>;
export type VersionRules = Rule[];

interface SelectionConfig extends Rule {
  extends?: string[];
  ignorePresets?: string[];
  packageRules?: Rule[];
}

/** Carry safe diagnostics without retaining raw causes that could expose credentials. */
class VersionSourceError extends Error {
  constructor(
    message: string,
    readonly details: string,
  ) {
    super(message);
  }
}

/**
 * Write a discovery snapshot, then optionally append constraints to the repo config.
 * Family errors still produce a snapshot but prevent config writes. Progress uses stderr.
 *
 * @returns 0 for successful discovery (including held releases), or 2 for family errors.
 * @throws Input, preset-resolution, or I/O failures; the executable maps rejections to exit 1.
 */
export async function main(
  args = process.argv.slice(2),
  sources = createVersionSources(),
): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      output: { type: "string" },
      "write-config": { type: "boolean", default: false },
      "repo-root": { type: "string", default: "../.." },
      families: { type: "string", default: "../../app-families.yaml" },
      "repo-config": { type: "string", default: "../../renovate.json" },
    },
  });
  if (!values.output) throw new Error("--output is required");

  const root = resolve(values["repo-root"]!);
  const mainSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const families = parseFamilies(await readFile(values.families!, "utf8"));
  const config = JSON.parse(await readFile(values["repo-config"]!, "utf8"));
  console.error(`[discovery] Starting discovery: families=${families.length} HEAD=${mainSha}`);

  const files: Record<string, string> = {};
  for (const file of new Set(families.flatMap(family => family.sourceFiles)))
    files[file] = await readFile(resolve(root, file), "utf8");

  const snapshot = await discover(families, files, config, sources, mainSha);
  await writeFile(values.output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.error(`[discovery] Snapshot written: ${values.output}`);

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
      values["repo-config"]!,
      `${JSON.stringify(appendConstraints(config, snapshot), null, 2)}\n`,
    );
    console.error(`[discovery] Config written: ${values["repo-config"]}`);
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

    const selection = selectFamily(family.name, observations);
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
    const observation = observe(dependency, flavor, pins, []);
    observation.error = {
      kind: "lookup-failed",
      message: `Publisher lookup failed: ${dependency.datasource}:${dependency.packageName}`,
    };
    return observation;
  }

  const observation = observe(dependency, flavor, pins, publisherReleases);
  if (!observation.error) applyVersionRestrictions(observation, rules, now);

  return observation;
}

function applyVersionRestrictions(
  observation: Observation,
  rules: VersionRules,
  now: number,
): void {
  try {
    for (const release of observation.releases) {
      let eligible = true;
      for (const pin of observation.current) {
        if (!isEligibleRelease(pin, release, restrictionsForPin(observation, pin, rules), now)) {
          eligible = false;
          break;
        }
      }

      release.eligible = eligible;
      release.reason = eligible ? undefined : "version-policy";
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

/**
 * Return a new config with exact-version rules scoped to each file and current value.
 * Existing rules and grouping remain intact. Apply extractVersion to publisher tags
 * when building allowedVersions so constraints match the value Renovate evaluates.
 * The caller must reject family errors before writing; this is not the run-level gate.
 *
 * @throws Unsupported snapshot schemas, missing current pins, or invalid extracted targets.
 */
export function appendConstraints<T extends { packageRules?: object[] }>(
  config: T,
  snapshot: Snapshot,
) {
  if (snapshot.schemaVersion !== 2) throw new Error("Unsupported snapshot schema");

  const exact = (value: string) => `/^${value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$/`;
  const generated = snapshot.families.flatMap(family => {
    if (
      family.status === "missing-pin" ||
      family.dependencies.some(dependency => !dependency.current.length)
    )
      throw new Error(`Cannot constrain missing-pin family: ${family.name}`);

    return family.targets.map(target => {
      const extracted = renovateValueForTag(target.pin, target.tag);
      if (target.pin.extractVersion && !extracted && target.tag !== target.pin.currentValue)
        throw new Error(`Invalid extracted target: ${target.packageName}`);

      return {
        matchDatasources: [target.datasource],
        matchPackageNames: [target.packageName],
        matchFileNames: [target.pin.file],
        matchCurrentValue: exact(target.pin.currentValue),
        allowedVersions: exact(extracted ?? target.tag),
      };
    });
  });

  return {
    ...config,
    packageRules: [...(config.packageRules ?? []), ...generated] as Array<Record<string, unknown>>,
  };
}

// Read only the application pins declared by each family, not chart versions.
export function parseFamilies(content: string): Family[] {
  const data = yaml.parse(content);
  if (!data || !Array.isArray(data.families) || !data.families.length)
    throw new Error("Expected nonempty families array");

  const names = new Set<string>();
  const owners = new Map<string, string>();

  function pattern(value: unknown): void {
    if (
      typeof value !== "string" ||
      !value.startsWith("^") ||
      !value.endsWith("$") ||
      !value.includes("(?<version>")
    )
      throw new Error("Expected anchored named-version tag pattern");
    new RegExp(value);
  }

  function dependency(value: Dependency): void {
    if (
      !value ||
      !["docker", "github-tags"].includes(value.datasource) ||
      typeof value.packageName !== "string" ||
      !/^[\w.-]+(?:\/[\w.-]+)+$/.test(value.packageName)
    )
      throw new Error("Invalid dependency identity");
    pattern(value.tagPattern);
  }

  for (const family of data.families as Family[]) {
    if (!family || typeof family.name !== "string" || !/^[a-z0-9-]+$/.test(family.name))
      throw new Error("Invalid family name");
    if (names.has(family.name)) throw new Error(`Duplicate family: ${family.name}`);
    names.add(family.name);

    if (
      !Array.isArray(family.sourceFiles) ||
      !family.sourceFiles.length ||
      family.sourceFiles.some(
        file => typeof file !== "string" || !file.startsWith("src/") || file.includes(".."),
      )
    )
      throw new Error("Invalid sourceFiles");

    dependency(family.appDependency);
    if (!family.flavors || typeof family.flavors !== "object" || Array.isArray(family.flavors))
      throw new Error("Expected flavor definitions");

    for (const [flavor, value] of Object.entries(family.flavors)) {
      if (
        !["upstream", "registry1", "unicorn"].includes(flavor) ||
        !Array.isArray(value?.images) ||
        !value.images.length
      )
        throw new Error("Invalid flavor images");

      for (const image of value.images) {
        dependency({
          datasource: "docker",
          packageName: image.repository,
          tagPattern: image.tagPattern,
        });
        const owner = owners.get(image.repository);
        if (owner && owner !== family.name)
          throw new Error(`Image belongs to multiple families: ${image.repository}`);
        owners.set(image.repository, family.name);
      }
    }
  }

  return data.families;
}

export function inventoryPins(dependency: Dependency, file: string, content: string): Pin[] {
  const pins: Pin[] = [];
  const add = (pin: Pin) => {
    if (!pins.some(existing => JSON.stringify(existing) === JSON.stringify(pin))) pins.push(pin);
  };

  if (dependency.datasource === "docker" && file.endsWith("zarf.yaml")) {
    const document = yaml.parse(content);
    for (const component of document?.components ?? [])
      for (const image of component.images ?? []) {
        if (typeof image !== "string") throw new Error(`Invalid image data: ${file}`);
        if (image.startsWith(`${dependency.packageName}:`))
          add({ file, currentValue: image.slice(dependency.packageName.length + 1) });
      }
  }

  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const annotation = /# renovate: (.*)/.exec(lines[index]);
    if (!annotation) continue;

    const fields = Object.fromEntries(
      [...annotation[1].matchAll(/(\w+)=(\S+)/g)].map(match => [match[1], match[2]]),
    );
    if (fields.datasource !== dependency.datasource || fields.depName !== dependency.packageName)
      continue;

    const value = /(?:default:\s*|[A-Z_]+=)["']?([^\s"']+)/.exec(lines[index + 1] ?? "")?.[1];
    if (!value) throw new Error(`Unsupported annotated pin: ${file}:${index + 1}`);
    add({
      file,
      currentValue: value,
      ...(fields.extractVersion ? { extractVersion: fields.extractVersion } : {}),
      ...(fields.versioning ? { versioning: fields.versioning } : {}),
    });
  }

  if (dependency.datasource === "github-tags") {
    for (const match of content.matchAll(
      /https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/(?:refs\/tags\/)?([^/\s"']+)\//g,
    )) {
      if (match[1] === dependency.packageName && !match[2].includes("${"))
        add({ file, currentValue: match[2], versioning: "semver-coerced" });
    }
  }

  return pins;
}

export function applicationVersionFromTag(
  pattern: string,
  publisherTag: string,
): string | undefined {
  const value = new RegExp(pattern).exec(publisherTag)?.groups?.version;
  return value ? (semver.valid(value) ?? undefined) : undefined;
}

function renovateValueForTag(pin: Pin, publisherTag: string): string | undefined {
  return pin.extractVersion
    ? new RegExp(pin.extractVersion).exec(publisherTag)?.groups?.version
    : publisherTag;
}

export function observe(
  dependency: Dependency,
  flavor: string,
  pins: Pin[],
  publisherReleases: PublisherRelease[],
): Observation {
  const current = pins.map(pin => ({
    ...pin,
    // Annotated source values may already have the publisher prefix removed.
    version:
      applicationVersionFromTag(dependency.tagPattern, pin.currentValue) ??
      (pin.extractVersion ? (semver.valid(pin.currentValue) ?? undefined) : undefined),
  }));

  const uniqueTags = new Map(publisherReleases.map(release => [release.tag, release]));
  const releases: ApplicationRelease[] = [];
  for (const release of uniqueTags.values()) {
    const version = applicationVersionFromTag(dependency.tagPattern, release.tag);
    if (version) releases.push({ ...release, version });
  }

  releases.sort((a, b) => semver.rcompare(a.version, b.version) || a.tag.localeCompare(b.tag));
  const latestVersion = releases[0]?.version ?? null;

  const result: Observation = {
    ...dependency,
    flavor,
    current,
    releases,
    latestVersion,
    latestTags: releases
      .filter(release => release.version === latestVersion)
      .map(release => release.tag),
  };

  if (current.some(pin => !pin.version))
    result.error = {
      kind: "invalid-data",
      message: "Current pin does not match the declared version pattern",
    };
  else if (!releases.length)
    result.error = { kind: "invalid-data", message: "No comparable releases returned" };

  return result;
}

/**
 * Choose the newest eligible version shared by the app and every required image.
 * Uses already-evaluated observations; errors, no intersection, or any downgrade
 * retain the original source targets rather than generating partial upgrades.
 */
export function selectFamily(name: string, dependencies: Observation[]): Selection {
  const result: Selection = {
    name,
    status: "no-shared-release",
    selectedRelease: null,
    dependencies,
    targets: retainedTargets(dependencies),
    publisherGaps: [],
  };

  const failure = dependencies.find(dependency => dependency.error)?.error;
  if (failure) return { ...result, status: failure.kind };
  if (!dependencies.length || dependencies.some(dependency => !dependency.current.length))
    return { ...result, status: "missing-pin" };

  const app = dependencies.find(dependency => dependency.flavor === "app");
  if (!app) return { ...result, status: "invalid-data" };

  if (app.latestVersion) {
    result.publisherGaps = dependencies
      .filter(
        dependency =>
          dependency.flavor !== "app" &&
          !dependency.releases.some(release => release.version === app.latestVersion),
      )
      .map(dependency => ({
        flavor: dependency.flavor,
        packageName: dependency.packageName,
        missingRelease: app.latestVersion!,
      }));
  }

  const shared = newestSharedRelease(app, dependencies);
  if (!shared) return result;

  if (wouldDowngrade(dependencies, shared.version))
    return { ...result, status: "downgrade-blocked" };

  result.selectedRelease = shared.version;
  const upgrade = dependencies.some(dependency =>
    dependency.current.some(pin => semver.lt(pin.version!, shared.version)),
  );
  result.status = upgrade ? "update-available" : "current";
  if (upgrade) result.targets = targetsForRelease(result.targets, dependencies, shared.version);

  return result;
}

function retainedTargets(dependencies: Observation[]): Target[] {
  const targets = new Map<string, Target>();
  for (const dependency of dependencies)
    for (const pin of dependency.current) {
      const target = {
        datasource: dependency.datasource,
        packageName: dependency.packageName,
        tagPattern: dependency.tagPattern,
        pin,
        tag: pin.currentValue,
      };
      targets.set(JSON.stringify(target), target);
    }

  return [...targets.values()];
}

function newestSharedRelease(
  app: Observation,
  dependencies: Observation[],
): ApplicationRelease | undefined {
  return [...app.releases]
    .sort((a, b) => semver.rcompare(a.version, b.version))
    .find(
      release =>
        release.eligible &&
        dependencies.every(dependency =>
          dependency.releases.some(
            candidate => candidate.version === release.version && candidate.eligible,
          ),
        ),
    );
}

function wouldDowngrade(dependencies: Observation[], version: string): boolean {
  return dependencies.some(dependency =>
    dependency.current.some(pin => !pin.version || semver.gt(pin.version, version)),
  );
}

function targetsForRelease(
  targets: Target[],
  dependencies: Observation[],
  version: string,
): Target[] {
  return targets.map(target => {
    const candidates = dependencies
      .find(
        dependency =>
          dependency.datasource === target.datasource &&
          dependency.packageName === target.packageName,
      )!
      .releases.filter(release => release.version === version && release.eligible);
    const sameFormat = target.pin.currentValue.replace(target.pin.version!, version);

    return {
      ...target,
      tag: candidates.find(release => release.tag === sameFormat)?.tag ?? candidates[0].tag,
    };
  });
}

// Interpret only selection-related settings in the current repo/preset chain.
// These audited built-ins add no app bounds; Renovate still handles their settings.
const builtins = new Set([
  ":dependencyDashboard",
  "config:base",
  "helpers:pinGitHubActionDigests",
  "helpers:pinGitHubActionDigestsToSemver",
  ":semanticCommits",
  ":semanticCommitTypeAll(chore)",
]);

const supported = [
  "allowedVersions",
  "minimumReleaseAge",
  "minimumReleaseAgeBehaviour",
  "minimumReleaseAgeBuffer",
  "ignoreUnstable",
  "enabled",
];

const unsupported = [
  "followTag",
  "versionCompatibility",
  "overrideDatasource",
  "overridePackageName",
  "registryUrls",
  "constraints",
  "maxMajorIncrement",
  "extends",
];

const selectors = [
  "matchDatasources",
  "matchPackageNames",
  "matchDepNames",
  "matchFileNames",
  "matchManagers",
  "matchCurrentValue",
];

/**
 * Load selection defaults and ordered rules from supported inherited/local config.
 * This is a bounded adapter, not Renovate's full configuration resolver. It retains
 * known unsupported selection restrictions so restrictionsForPin can reject matches.
 *
 * @throws Presets that are unsupported, unreadable, or circular.
 */
export async function readVersionRules(
  config: SelectionConfig,
  readPreset?: (preset: string) => Promise<string>,
): Promise<VersionRules> {
  const sources: SelectionConfig[] = [];
  const ignored = new Set(config.ignorePresets ?? []);

  async function visit(source: SelectionConfig, ancestors: string[]): Promise<void> {
    for (const preset of source.extends ?? []) {
      if (ignored.has(preset) || builtins.has(preset)) continue;
      if (!/^github>[^/]+\/[^/]+\/\/.+/.test(preset) || !readPreset)
        throw new Error(`Unsupported preset in selection restrictions: ${preset}`);
      if (ancestors.includes(preset)) throw new Error(`Circular selection preset: ${preset}`);
      await visit(JSON5.parse(await readPreset(preset)), [...ancestors, preset]);
    }

    sources.push(source);
  }

  await visit(config, []);

  const defaults = Object.assign(
    {},
    ...sources.map(source =>
      Object.fromEntries(
        [...supported, ...unsupported.filter(key => key !== "extends")]
          .filter(key => key in source)
          .map(key => [key, source[key]]),
      ),
    ),
  );

  return [
    defaults,
    ...sources
      .flatMap(source => source.packageRules ?? [])
      .filter(rule => [...supported, ...unsupported].some(key => key in rule)),
  ];
}

function matches(value: string, patterns: unknown): boolean {
  const entries = typeof patterns === "string" ? [patterns] : patterns;
  if (!Array.isArray(entries) || !entries.every(entry => typeof entry === "string"))
    throw new Error("Unsupported restriction matcher");

  const test = (pattern: string) => {
    const regex = /^\/(.*)\/(i?)$/.exec(pattern);
    return regex
      ? new RegExp(regex[1], regex[2]).test(value)
      : minimatch(value, pattern, { dot: true, nonegate: true, nocase: true });
  };
  const positive = entries.filter(pattern => !pattern.startsWith("!"));

  return (
    (!positive.length || positive.some(test)) &&
    entries.filter(pattern => pattern.startsWith("!")).every(pattern => !test(pattern.slice(1)))
  );
}

function duration(value: string | null | undefined): number {
  if (value === undefined || value === null || value === "") return 0;

  const match = /^(\d+)\s+(minute|hour|day|week)s?$/.exec(String(value));
  if (!match) throw new Error(`Unsupported release-age duration: ${value}`);

  return (
    Number(match[1]) *
    { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[match[2]]!
  );
}

/**
 * Apply supported matching rules in order for one source occurrence.
 * Reject unknown selectors or restrictions on otherwise matching rules so an
 * applicable bound cannot silently disappear from shared-release selection.
 */
export function restrictionsForPin(
  dependency: Dependency,
  pin: Pin,
  rules: VersionRules,
): VersionRestrictions {
  const values: Record<string, string> = {
    matchDatasources: dependency.datasource,
    matchPackageNames: dependency.packageName,
    matchDepNames: dependency.packageName,
    matchFileNames: pin.file,
    matchManagers: "custom.regex",
    matchCurrentValue: pin.currentValue,
  };

  const policy: Rule = {};
  for (const rule of rules) {
    if (selectors.some(key => key in rule && !matches(values[key], rule[key]))) continue;

    const unknown = Object.keys(rule).find(
      key => key.startsWith("match") && !selectors.includes(key),
    );
    const mapping = unsupported.find(key => key in rule);
    if (unknown || mapping)
      throw new Error(`Unsupported selection restriction: ${unknown ?? mapping}`);

    for (const key of supported) if (key in rule) policy[key] = rule[key];
  }

  return policy;
}

/**
 * Check enabled updates, version bounds, prereleases, and release age for one pin.
 * Regex bounds use the extracted source value. Semver bounds require that value
 * to represent the same semver as the normalized application version.
 *
 * @param now Run observation time in epoch milliseconds, shared across age checks.
 * @throws Restrictions, tag extraction, or timestamps that cannot be safely evaluated.
 */
export function isEligibleRelease(
  pin: Pin,
  release: ApplicationRelease,
  restrictions: VersionRestrictions,
  now = Date.now(),
): boolean {
  const { version } = release;
  if (!release.eligible || restrictions.enabled === false) return false;
  if (restrictions.ignoreUnstable !== false && (semver.prerelease(version) || release.isPrerelease))
    return false;

  const value = renovateValueForTag(pin, release.tag);
  if (!value) throw new Error("Unsupported tag extraction");

  if (restrictions.allowedVersions !== undefined && restrictions.allowedVersions !== null) {
    const allowed = String(restrictions.allowedVersions);
    if (allowed.includes("{{")) throw new Error("Unsupported templated allowedVersions");

    if (/^!?\/.*\/$/.test(allowed)) {
      const negate = allowed.startsWith("!");
      const regex = new RegExp(allowed.slice(negate ? 2 : 1, -1));
      if (regex.test(value) === negate) return false;
    } else {
      if (!semver.validRange(allowed)) throw new Error(`Unsupported allowedVersions: ${allowed}`);
      // Do not erase suffixes or prefixes that Renovate's versioning may interpret
      // differently when its original allowedVersions is replaced by an exact rule.
      if (semver.valid(value) !== version)
        throw new Error("Unsupported semver bound for publisher tag representation");
      if (
        !semver.satisfies(version, allowed, {
          includePrerelease: restrictions.ignoreUnstable === false,
        })
      )
        return false;
    }
  }

  const age = duration(restrictions.minimumReleaseAge);
  if (!age) return true;
  if (!release.releaseTimestamp)
    return restrictions.minimumReleaseAgeBehaviour === "timestamp-optional";

  const timestamp = Date.parse(release.releaseTimestamp);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid release timestamp");

  // An omitted buffer adds 30 minutes to a nonzero minimum release age.
  const buffer =
    restrictions.minimumReleaseAgeBuffer === undefined
      ? "30 minutes"
      : restrictions.minimumReleaseAgeBuffer;
  return now - timestamp >= age + duration(buffer);
}

function safeFailureDetails(error: unknown): string {
  if (error instanceof VersionSourceError) return error.details;
  if (!error || typeof error !== "object") return "details unavailable";

  const { code, signal, stderr } = error as { code?: unknown; signal?: unknown; stderr?: unknown };
  const details: string[] = [];
  if (typeof code === "number" && Number.isInteger(code) && code >= 0 && code <= 255)
    details.push(`exit=${code}`);
  else if (
    typeof code === "string" &&
    [
      "ENOENT",
      "EACCES",
      "EPERM",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EPIPE",
      "ENOBUFS",
      "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    ].includes(code)
  )
    details.push(`code=${code}`);
  if (
    typeof signal === "string" &&
    ["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGABRT"].includes(signal)
  )
    details.push(`signal=${signal}`);
  const http =
    typeof stderr === "string"
      ? /\b(?:HTTP(?:\/\d(?:\.\d)?)?|status(?: code)?)[\s:=]+([45]\d{2})\b/i.exec(stderr)?.[1]
      : undefined;
  if (http) details.push(`http=${http}`);

  return details.join(", ") || "details unavailable";
}

// Delegate authentication and pagination to the existing CLI tools.
export type RunCommand = (command: string, args: string[]) => Promise<string>;

const runCommand: RunCommand = async (command, args) =>
  (await promisify(execFile)(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }))
    .stdout;

const tagsQuery = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/tags/", first: 100, after: $endCursor) {
      nodes { name target {
        ... on Commit { committedDate }
        ... on Tag { tagger { date } }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

interface TagPage {
  data: {
    repository: {
      refs: {
        nodes: Array<{
          name: string;
          target: { committedDate?: string; tagger?: { date?: string } };
        }>;
        pageInfo: { hasNextPage: boolean };
      };
    };
  };
}

interface GitHubRelease {
  tag_name: string;
  published_at: string | null;
  prerelease: boolean;
}

/**
 * Read Docker tags with crane and GitHub tags/releases/presets with gh api.
 * Requires complete pagination and retains raw publisher tags and release metadata.
 * Failures retain only allowlisted context, never raw command output or response bodies.
 */
export function createVersionSources(run: RunCommand = runCommand): VersionSources {
  return {
    async readPreset(preset) {
      const match = /^github>([^/]+\/[^/]+)\/\/([^#]+)(?:#(.+))?$/.exec(preset);
      if (!match) throw new Error(`Unsupported selection preset: ${preset}`);

      const [, repo, file, ref] = match;
      try {
        const endpoint = `repos/${repo}/contents/${file}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
        return Buffer.from(
          await run("gh", ["api", endpoint, "--jq", ".content"]),
          "base64",
        ).toString("utf8");
      } catch (error) {
        throw new VersionSourceError(
          `Cannot read selection preset: ${preset}`,
          safeFailureDetails(error),
        );
      }
    },

    async lookup(dependency) {
      try {
        if (dependency.datasource === "docker") {
          // TODO: Revisit `uds zarf tools registry ls` once bundled Zarf requests bounded
          // tag-list pages to avoid ORAS's 4 MiB metadata-response limit.
          const tags = await run("crane", ["ls", dependency.packageName]);
          return tags
            .split(/\r?\n/)
            .filter(Boolean)
            .map(tag => ({ tag, eligible: true }));
        }

        const [owner, name, extra] = dependency.packageName.split("/");
        if (!owner || !name || extra) throw new Error("Invalid GitHub package identity");

        const pages: TagPage[] = JSON.parse(
          await run("gh", [
            "api",
            "graphql",
            "--paginate",
            "--slurp",
            "-f",
            `owner=${owner}`,
            "-f",
            `name=${name}`,
            "-f",
            `query=${tagsQuery}`,
          ]),
        );
        if (
          !Array.isArray(pages) ||
          !pages.length ||
          pages[pages.length - 1].data.repository.refs.pageInfo.hasNextPage !== false
        )
          throw new Error("Incomplete GitHub tag pagination");

        const tags: PublisherRelease[] = pages.flatMap(page =>
          page.data.repository.refs.nodes.map(node => {
            if (typeof node.name !== "string") throw new Error("Invalid GitHub tag data");
            return {
              tag: node.name,
              eligible: true,
              releaseTimestamp: node.target.committedDate ?? node.target.tagger?.date,
            };
          }),
        );

        // Project each page before buffering: release notes/assets can be large.
        const output = await run("gh", [
          "api",
          `repos/${owner}/${name}/releases?per_page=100`,
          "--paginate",
          "--jq",
          "map({tag_name, published_at, prerelease}) | @json",
        ]);
        const releases = output
          .split(/\r?\n/)
          .filter(Boolean)
          .flatMap((line): GitHubRelease[] => JSON.parse(line));
        const metadata = new Map(releases.map(release => [release.tag_name, release]));

        return tags.map(tag => {
          const release = metadata.get(tag.tag);
          if (!release) return tag;

          if (release.published_at && !Number.isFinite(Date.parse(release.published_at)))
            throw new Error("Invalid GitHub publication date");

          return {
            ...tag,
            isPrerelease: release.prerelease,
            releaseTimestamp:
              release.published_at &&
              (!tag.releaseTimestamp ||
                Date.parse(release.published_at) > Date.parse(tag.releaseTimestamp))
                ? release.published_at
                : tag.releaseTimestamp,
          };
        });
      } catch (error) {
        // Never include CLI output or response bodies, which may contain credentials.
        throw new VersionSourceError(
          `Publisher lookup failed: ${dependency.datasource}:${dependency.packageName}`,
          safeFailureDetails(error),
        );
      }
    },
  };
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
