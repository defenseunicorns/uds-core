// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

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

export interface Selection {
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

export interface SelectionConfig extends Rule {
  extends?: string[];
  ignorePresets?: string[];
  packageRules?: Rule[];
}

/**
 * Return a new config with exact-version rules scoped to each file and current value.
 * Existing rules and grouping remain intact. Apply extractVersion to publisher tags
 * when building allowedVersions so constraints match the value Renovate evaluates.
 * The caller must reject family errors before writing; this is not the run-level gate.
 *
 * @throws Missing current pins or invalid extracted targets.
 */
export function appendConstraints<T extends { packageRules?: object[] }>(
  config: T,
  families: Selection[],
) {
  const exact = (value: string) => `/^${value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$/`;
  const generated = families.flatMap(family => {
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

export function parseFamilies(content: string): Family[] {
  const data = yaml.parse(content);
  if (!data || !Array.isArray(data.families) || !data.families.length)
    throw new Error("Expected nonempty families array");

  const names = new Set<string>();
  const owners = new Map<string, string>();

  function validateTagPattern(value: unknown): void {
    if (
      typeof value !== "string" ||
      !value.startsWith("^") ||
      !value.endsWith("$") ||
      !value.includes("(?<version>")
    )
      throw new Error("Expected anchored named-version tag pattern");
    new RegExp(value);
  }

  function validateDependency(value: Dependency): void {
    if (
      !value ||
      !["docker", "github-tags"].includes(value.datasource) ||
      typeof value.packageName !== "string" ||
      !/^[\w.-]+(?:\/[\w.-]+)+$/.test(value.packageName)
    )
      throw new Error("Invalid dependency identity");
    validateTagPattern(value.tagPattern);
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

    validateDependency(family.appDependency);
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
        validateDependency({
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

    const value = /(?:(?:default|version):\s*|[A-Z_]+=)["']?([^\s"']+)/.exec(
      lines[index + 1] ?? "",
    )?.[1];
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

function applicationVersionFromTag(pattern: string, publisherTag: string): string | undefined {
  const value = new RegExp(pattern).exec(publisherTag)?.groups?.version;
  return value ? (semver.valid(value) ?? undefined) : undefined;
}

function renovateValueForTag(pin: Pin, publisherTag: string): string | undefined {
  return pin.extractVersion
    ? new RegExp(pin.extractVersion).exec(publisherTag)?.groups?.version
    : publisherTag;
}

export function buildDependencyObservation(
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
export function selectFamilyRelease(name: string, dependencies: Observation[]): Selection {
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

function matchesRulePatterns(value: string, patterns: unknown): boolean {
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

function parseDurationMs(value: string | null | undefined): number {
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
    if (selectors.some(key => key in rule && !matchesRulePatterns(values[key], rule[key])))
      continue;

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

  const age = parseDurationMs(restrictions.minimumReleaseAge);
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
  return now - timestamp >= age + parseDurationMs(buffer);
}
