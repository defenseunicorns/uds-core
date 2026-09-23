/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { once } from "node:events";
import { connect, constants, type ClientHttp2Session } from "node:http2";
import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const wildcardHosts = [`demo-8080.${domain}`, `demo-8081.${domain}`];
const tenantHosts = [
  wildcardHosts[0],
  wildcardHosts[1],
  wildcardHosts[0],
  wildcardHosts[1],
];
const passthroughHost = `passthrough-test.${domain}`;

async function connectToTenant(): Promise<ClientHttp2Session> {
  const session = connect(`https://${wildcardHosts[0]}`, { rejectUnauthorized: false });
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

test("serves tenant hosts on one HTTP/2 connection", async () => {
  const session = await connectToTenant();

  try {
    for (const host of tenantHosts) {
      await expect(request(session, host)).resolves.toBe(200);
    }
  } finally {
    session.close();
  }
});

test("returns 421 when a tenant connection targets a passthrough authority", async () => {
  const session = await connectToTenant();

  try {
    await expect(request(session, wildcardHosts[0])).resolves.toBe(200);
    await expect(request(session, passthroughHost)).resolves.toBe(421);
  } finally {
    session.close();
  }
});
