// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Dependency, PublisherRelease } from "./shared-releases";

export interface VersionSources {
  lookup(dependency: Dependency): Promise<PublisherRelease[]>;
  readPreset(preset: string): Promise<string>;
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

export function safeFailureDetails(error: unknown): string {
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
export function createCliVersionSources(run: RunCommand = runCommand): VersionSources {
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
