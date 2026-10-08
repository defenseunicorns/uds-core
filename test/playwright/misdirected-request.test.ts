/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { once } from "node:events";
import { connect, constants, type ClientHttp2Session } from "node:http2";
import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const wildcardHosts = [`demo-8080.${domain}`, `demo-8081.${domain}`];
const passthroughHost = `passthrough-test.${domain}`;

async function connectToTenant(host = wildcardHosts[0]): Promise<ClientHttp2Session> {
  const session = connect(`https://${host}`, { rejectUnauthorized: false });
  await once(session, "connect");
  return session;
}

async function request(session: ClientHttp2Session, authority: string): Promise<number> {
  const stream = session.request({
    [constants.HTTP2_HEADER_AUTHORITY]: authority,
    [constants.HTTP2_HEADER_METHOD]: "GET",
    [constants.HTTP2_HEADER_PATH]: "/",
  });
  const [headers] = await once(stream, "response");
  stream.resume();
  await once(stream, "end");
  return Number(headers[constants.HTTP2_HEADER_STATUS]);
}

test.use({ storageState: { cookies: [], origins: [] } });

test("returns 421 when a tenant connection targets a different tenant authority", async () => {
  const session = await connectToTenant();

  try {
    await expect(request(session, wildcardHosts[0])).resolves.toBe(200);
    await expect(request(session, wildcardHosts[1])).resolves.toBe(421);
  } finally {
    session.close();
  }

  const alternateSession = await connectToTenant(wildcardHosts[1]);
  try {
    await expect(request(alternateSession, wildcardHosts[1])).resolves.toBe(200);
  } finally {
    alternateSession.close();
  }
});

test("returns 421 when a tenant connection targets a passthrough authority", async () => {
  test.skip(process.env.VALIDATE_PASSTHROUGH === "false", "Passthrough gateway is not deployed");
  const session = await connectToTenant();

  try {
    await expect(request(session, wildcardHosts[0])).resolves.toBe(200);
    await expect(request(session, passthroughHost)).resolves.toBe(421);
  } finally {
    session.close();
  }
});
