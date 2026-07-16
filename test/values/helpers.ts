/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { exec } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect } from "vitest";
import { parseAllDocuments } from "yaml";

const execAsync = promisify(exec);

export interface K8sResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  data?: Record<string, string>;
  [key: string]: unknown;
}

export interface RenderOptions {
  values?: Record<string, unknown>;
  variables?: Record<string, string>;
}

export interface DomainScenario {
  name: string;
  values: Record<string, unknown>;
  variables: Record<string, string>;
  expectedAdminDomain: string;
  expectedDomain: string;
}

type ResourcePathSegment = string | number;

const ROOT = process.cwd();

const renderCache = new Map<string, Promise<K8sResource[]>>();

function cacheKey(pkg: string, opts?: RenderOptions): string {
  return JSON.stringify({ pkg, values: opts?.values, variables: opts?.variables });
}

export async function renderManifests(pkg: string, opts?: RenderOptions): Promise<K8sResource[]> {
  const key = cacheKey(pkg, opts);
  const cached = renderCache.get(key);
  if (cached) return cached;

  const promise = renderManifestsUncached(pkg, opts);
  renderCache.set(key, promise);
  return promise;
}

async function renderManifestsUncached(pkg: string, opts?: RenderOptions): Promise<K8sResource[]> {
  const tmp = mkdtempSync(join(tmpdir(), "zarf-values-test-"));
  try {
    const renderValues = [`--values`, `packages/${pkg}/zarf-values.yaml`];

    if (opts?.values && Object.keys(opts.values).length > 0) {
      const overridePath = join(tmp, "override.yaml");
      const yaml = Object.entries(opts.values)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n");
      writeFileSync(overridePath, yaml);
      renderValues.push("--values", overridePath);
    }

    const vars = opts?.variables;
    const varArgs: string[] = [];
    if (vars && Object.keys(vars).length > 0) {
      const varString = Object.entries(vars)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
      varArgs.push(`--deploy-set-variables`, varString);
    }

    const cmd = [
      "uds zarf dev inspect manifests",
      `packages/${pkg}`,
      "--flavor upstream",
      ...renderValues,
      ...varArgs,
      "--no-color",
    ].join(" ");

    const outPath = join(tmp, "manifests.yaml");
    await execAsync(`${cmd} > ${outPath}`, {
      cwd: ROOT,
      timeout: 120_000,
    });
    const stdout = readFileSync(outPath, "utf-8");

    const docs = parseAllDocuments(stdout);
    return docs
      .map(d => d.toJS() as K8sResource)
      .filter((d): d is K8sResource => d != null && typeof d === "object" && "kind" in d);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function findResource(
  manifests: K8sResource[],
  kind: string,
  name: string,
  namespace?: string,
): K8sResource | undefined {
  return manifests.find(
    r =>
      r.kind === kind &&
      r.metadata?.name === name &&
      (namespace === undefined || r.metadata?.namespace === namespace),
  );
}

export function findResources(
  manifests: K8sResource[],
  kind: string,
  namespace?: string,
): K8sResource[] {
  return manifests.filter(
    r => r.kind === kind && (namespace === undefined || r.metadata?.namespace === namespace),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatPath(path: ResourcePathSegment[]): string {
  return path.map(segment => (typeof segment === "number" ? `[${segment}]` : segment)).join(".");
}

function resourceValue(resource: K8sResource | undefined, path: ResourcePathSegment[]): unknown {
  if (!resource) {
    throw new Error(`Cannot read ${formatPath(path)} from a missing resource`);
  }

  let value: unknown = resource;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(value) || segment >= value.length) {
        throw new Error(`Expected array element at ${formatPath(path)}`);
      }
      value = value[segment];
    } else {
      if (!isRecord(value) || !(segment in value)) {
        throw new Error(`Expected property at ${formatPath(path)}`);
      }
      value = value[segment];
    }
  }

  return value;
}

export function resourceString(
  resource: K8sResource | undefined,
  ...path: ResourcePathSegment[]
): string {
  const value = resourceValue(resource, path);
  if (typeof value !== "string") {
    throw new Error(`Expected string at ${formatPath(path)}`);
  }
  return value;
}

export function resourceNumber(
  resource: K8sResource | undefined,
  ...path: ResourcePathSegment[]
): number {
  const value = resourceValue(resource, path);
  if (typeof value !== "number") {
    throw new Error(`Expected number at ${formatPath(path)}`);
  }
  return value;
}

export function resourceStringArray(
  resource: K8sResource | undefined,
  ...path: ResourcePathSegment[]
): string[] {
  const value = resourceValue(resource, path);
  if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
    throw new Error(`Expected string array at ${formatPath(path)}`);
  }
  return value;
}

export function gatewayHosts(resource: K8sResource | undefined): string[] {
  const servers = resourceValue(resource, ["spec", "servers"]);
  if (!Array.isArray(servers)) {
    throw new Error("Expected array at spec.servers");
  }

  return servers.flatMap((server, index) => {
    if (!isRecord(server) || !Array.isArray(server.hosts)) {
      throw new Error(`Expected host array at spec.servers[${index}].hosts`);
    }
    if (!server.hosts.every(host => typeof host === "string")) {
      throw new Error(`Expected string hosts at spec.servers[${index}].hosts`);
    }
    return server.hosts;
  });
}

export function containerEnvValue(
  resource: K8sResource | undefined,
  envName: string,
): string | undefined {
  const containers = resourceValue(resource, ["spec", "template", "spec", "containers"]);
  if (!Array.isArray(containers)) {
    throw new Error("Expected array at spec.template.spec.containers");
  }

  for (const [containerIndex, container] of containers.entries()) {
    if (!isRecord(container)) {
      throw new Error(`Expected object at spec.template.spec.containers[${containerIndex}]`);
    }
    if (container.env === undefined) continue;
    if (!Array.isArray(container.env)) {
      throw new Error(`Expected env array for container ${containerIndex}`);
    }

    for (const [envIndex, env] of container.env.entries()) {
      if (!isRecord(env)) {
        throw new Error(`Expected object for container ${containerIndex} env ${envIndex}`);
      }
      if (env.name !== envName) continue;
      if (typeof env.value !== "string") {
        throw new Error(`Expected string value for environment variable ${envName}`);
      }
      return env.value;
    }
  }

  return undefined;
}

export function hasNetworkAllowDescription(
  resource: K8sResource | undefined,
  description: string,
): boolean {
  const allows = resourceValue(resource, ["spec", "network", "allow"]);
  if (!Array.isArray(allows)) {
    throw new Error("Expected array at spec.network.allow");
  }
  return allows.some(allow => isRecord(allow) && allow.description === description);
}

export function allStrings(obj: unknown): string[] {
  const strings: string[] = [];
  const walk = (val: unknown) => {
    if (typeof val === "string") {
      strings.push(val);
    } else if (Array.isArray(val)) {
      val.forEach(walk);
    } else if (val && typeof val === "object") {
      Object.values(val).forEach(walk);
    }
  };
  walk(obj);
  return strings;
}

export function expectNoExcludedValues(manifests: K8sResource[]) {
  const all = manifests.flatMap(allStrings);
  expect(all.some(s => s.includes("SHOULD_NOT_APPEAR"))).toBe(false);
}

export async function preRenderDomainScenarios(pkg: string): Promise<Map<string, K8sResource[]>> {
  const entries = await Promise.all(
    DOMAIN_SCENARIOS.map(async s => {
      const manifests = await renderManifests(pkg, { values: s.values, variables: s.variables });
      return [s.name, manifests] as const;
    }),
  );
  return new Map(entries);
}

export const DOMAIN_SCENARIOS: DomainScenario[] = [
  {
    name: "defaults",
    values: {},
    variables: {},
    expectedAdminDomain: "admin.uds.dev",
    expectedDomain: "uds.dev",
  },
  {
    name: "domain-variable-fallback",
    values: {},
    variables: { DOMAIN: "fallback.example.com" },
    expectedAdminDomain: "admin.fallback.example.com",
    expectedDomain: "fallback.example.com",
  },
  {
    name: "domain-value",
    values: { domain: "custom.example.com", adminDomain: "" },
    variables: { DOMAIN: "uds.dev" },
    expectedAdminDomain: "admin.custom.example.com",
    expectedDomain: "custom.example.com",
  },
  {
    name: "admin-domain-value",
    values: { domain: "custom.example.com", adminDomain: "mgmt.example.com" },
    variables: { DOMAIN: "uds.dev", ADMIN_DOMAIN: "ignored.example.com" },
    expectedAdminDomain: "mgmt.example.com",
    expectedDomain: "custom.example.com",
  },
  {
    name: "admin-domain-variable",
    values: { domain: "custom.example.com", adminDomain: "" },
    variables: { DOMAIN: "uds.dev", ADMIN_DOMAIN: "myadmin.example.com" },
    expectedAdminDomain: "myadmin.example.com",
    expectedDomain: "custom.example.com",
  },
];
