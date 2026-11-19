// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCliVersionSources } from "./discover-versions";

const credentials = "fixture-user:fixture-password";
const authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
const servers: Server[] = [];
let configDirectory: string;

beforeEach(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), "core776-registry-"));
  vi.stubEnv("DOCKER_CONFIG", configDirectory);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await rm(configDirectory, { recursive: true, force: true });
});

// Exercise real crane authentication and pagination without contacting a publisher.
async function startTestRegistry(failSecondPage = false) {
  const pages: string[] = [];
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");

    if (request.headers.authorization !== authorization) {
      response.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' });
      response.end("{}");
      return;
    }

    if (request.url === "/v2/") {
      response.end("{}");
      return;
    }

    pages.push(request.url!);
    // Require crane's bounded default page size, not an oversized unpaged response.
    if (request.url === "/v2/app/tags/list?n=1000") {
      response.setHeader("Link", '</v2/app/tags/list?last=v1.0.0>; rel="next"');
      response.end(JSON.stringify({ name: "app", tags: ["v1.0.0"] }));
    } else if (request.url === "/v2/app/tags/list?last=v1.0.0") {
      if (failSecondPage) response.writeHead(403);
      response.end(JSON.stringify({ name: "app", tags: ["v1.1.0"] }));
    } else {
      response.writeHead(404);
      response.end("{}");
    }
  });

  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture registry address");

  return { host: `127.0.0.1:${address.port}`, pages };
}

async function writeDockerCredentials(host: string) {
  await writeFile(
    join(configDirectory, "config.json"),
    JSON.stringify({
      auths: {
        [host]: { auth: Buffer.from(credentials).toString("base64") },
      },
    }),
  );
}

async function lookup(host: string) {
  const sources = createCliVersionSources(async (command, args) => {
    const { stdout } = await promisify(execFile)(command, args, {
      encoding: "utf8",
      timeout: 15_000,
    });
    return stdout;
  });
  return sources.lookup({
    datasource: "docker",
    packageName: `${host}/app`,
    tagPattern: "^v(?<version>\\d+\\.\\d+\\.\\d+)$",
  });
}

describe("registry discovery through crane", { timeout: 20_000 }, () => {
  it("requests bounded pages using credentials from Docker config", async () => {
    const { host, pages } = await startTestRegistry();
    await writeDockerCredentials(host);

    expect((await lookup(host)).map(release => release.tag)).toEqual(["v1.0.0", "v1.1.0"]);
    expect(pages).toEqual(["/v2/app/tags/list?n=1000", "/v2/app/tags/list?last=v1.0.0"]);
  });

  it("authenticates using the configured Docker credential helper", async () => {
    const { host } = await startTestRegistry();
    await writeFile(
      join(configDirectory, "config.json"),
      JSON.stringify({ credHelpers: { [host]: "fixture" } }),
    );
    // Answer the Docker credential helper's get request with fixture credentials only.
    await writeFile(
      join(configDirectory, "docker-credential-fixture"),
      '#!/bin/sh\nprintf \'%s\\n\' \'{"Username":"fixture-user","Secret":"fixture-password"}\'\n',
      { mode: 0o700 },
    );
    vi.stubEnv("PATH", `${configDirectory}${delimiter}${process.env.PATH}`);

    expect((await lookup(host)).map(release => release.tag)).toEqual(["v1.0.0", "v1.1.0"]);
  });

  it("rejects the lookup when a later tag page fails", async () => {
    const { host, pages } = await startTestRegistry(true);
    await writeDockerCredentials(host);

    await expect(lookup(host)).rejects.toThrow(`Publisher lookup failed: docker:${host}/app`);
    expect(pages).toContain("/v2/app/tags/list?last=v1.0.0");
  });

  it("rejects unauthenticated registry lookups", async () => {
    const { host } = await startTestRegistry();

    await expect(lookup(host)).rejects.toThrow(`Publisher lookup failed: docker:${host}/app`);
  });
});
