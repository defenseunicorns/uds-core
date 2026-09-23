/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchWithTimeout } from "./fetch";

describe("fetchWithTimeout", () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      if (request.url === "/slow") {
        const timer = setTimeout(() => response.end("ok"), 5000);
        request.on("close", () => clearTimeout(timer));
        return;
      }

      if (request.url === "/partial") {
        response.writeHead(200, { "content-type": "text/plain" });
        response.flushHeaders();
        response.write("partial");
        return;
      }

      response.end("ok");
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Test server did not expose a port"));
          return;
        }

        url = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  });

  it("returns a normal response", async () => {
    const response = await fetchWithTimeout(url);

    await expect(response.text()).resolves.toBe("ok");
  });

  it("fails a stalled request with request context", async () => {
    await expect(fetchWithTimeout(`${url}/slow`, {}, 50)).rejects.toMatchObject({
      message: expect.stringContaining("GET http://127.0.0.1:"),
    });
  });

  it("aborts a response body that stalls after headers", async () => {
    const response = await fetchWithTimeout(`${url}/partial`, {}, 1000);

    await expect(response.text()).rejects.toMatchObject({
      message: expect.stringContaining("GET http://127.0.0.1:"),
    });
  });
});
