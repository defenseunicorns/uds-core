/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";

// Global variables
let lokiBackend: { server: net.Server; url: string };
let lokiRead: { server: net.Server; url: string };
let lokiWrite: { server: net.Server; url: string };
let lokiGateway: { server: net.Server; url: string };

// Helper functions
const getLokiUrl = (path: string, component: { url: string }) => `${component.url}${path}`;

// Reuse Loki URL for sending logs
const sendLog = async (
  logMessage: string,
  labels: Record<string, string>,
  timestamp: string = `${Date.now() * 1_000_000}`,
  expectReject: boolean = false,
): Promise<void> => {
  const logEntry = {
    streams: [{ stream: labels, values: [[timestamp, logMessage]] }],
  };

  try {
    const response = await fetch(getLokiUrl("/loki/api/v1/push", lokiWrite), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logEntry),
    });

    if (!response.ok) {
      if (expectReject && response.status === 400) return;
      throw new Error(`Unexpected log ingestion failure: ${logMessage}`);
    }

    if (expectReject) throw new Error(`Unexpected log acceptance: ${logMessage}`);
  } catch (error: unknown) {
    if (error instanceof Error && !(expectReject && error.message.includes("400"))) {
      console.error(`Error in log ingestion: ${logMessage}`, error.message);
      throw error;
    }
  }
};

const queryLogs = async (
  query: string,
  limit = 1,
): Promise<{ status: string; data: { result: Array<{ values: string[][] }> } }> => {
  try {
    const response = await fetch(
      getLokiUrl(
        `/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=${limit}`,
        lokiRead,
      ),
      {
        method: "GET",
      },
    );
    if (!response.ok) throw new Error("Error in querying logs");
    return (await response.json()) as unknown as {
      status: string;
      data: { result: Array<{ values: string[][] }> };
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error in querying logs", error.message);
      throw error;
    }
    throw new Error("Unknown error in querying logs");
  }
};

const checkLokiServices = async (
  component: string,
  expectedServices: string[],
  urlComponent: { url: string },
): Promise<void> => {
  try {
    const response = await fetch(getLokiUrl("/services", urlComponent));
    if (!response.ok) throw new Error(`Error checking services for ${component}`);

    const servicesList = (await response.text()).split("\n");
    expectedServices.forEach(service => {
      if (!servicesList.some(svc => svc.includes(`${service} => Running`))) {
        throw new Error(`${service} is not running for ${component}`);
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error checking services for ${component}`, error.message);
      throw error;
    }
    throw new Error("Unknown error checking services");
  }
};

// Unified log validation function
const validateLogInQuery = (
  queryData: { status: string; data: { result: Array<{ values: string[][] }> } },
  logMessage: string,
): void => {
  expect(queryData).toHaveProperty("status", "success");
  expect(Array.isArray(queryData.data.result)).toBe(true);
  const logExists = queryData.data.result.some(stream =>
    stream.values.some(value => value.includes(logMessage)),
  );
  expect(logExists).toBe(true);
};

// Vitest test cases
describe("Loki Tests", () => {
  beforeAll(async () => {
    lokiBackend = await getForward("loki-backend", "loki", 3100);
    lokiRead = await getForward("loki-read", "loki", 3100);
    lokiWrite = await getForward("loki-write", "loki", 3100);
    lokiGateway = await getForward("loki-gateway", "loki", 8080);
  });

  afterAll(async () => {
    await closeForward(lokiBackend.server);
    await closeForward(lokiRead.server);
    await closeForward(lokiWrite.server);
    await closeForward(lokiGateway.server);
  });

  test("Validate Vector logs are present in Loki (loki-read)", async () => {
    const data = await queryLogs('{collector="vector"}');
    expect(data).toHaveProperty("status", "success");
    expect(Array.isArray(data.data.result)).toBe(true);
  });

  test("Validate node logs from vector are present in Loki", async () => {
    const data = await queryLogs('{service_name="varlogs", collector="vector"}');
    expect(data).toHaveProperty("status", "success");
    expect(Array.isArray(data.data.result)).toBe(true);
  });

  test("Validate pod logs from vector are present in Loki", async () => {
    const data = await queryLogs('{service_name="pepr-uds-core", collector="vector"}');
    expect(data).toHaveProperty("status", "success");
    expect(Array.isArray(data.data.result)).toBe(true);
  });

  test("Send log to Loki-write and validate in Loki-read", async () => {
    const logMessage = "Test log from vitest";
    await sendLog(logMessage, { job: "test-job", level: "info" });
    const data = await queryLogs('{job="test-job"}');
    validateLogInQuery(data, logMessage);
  });

  test("Check services are running for loki-read", async () => {
    const expectedServices = [
      "querier",
      "server",
      "runtime-config",
      "ring",
      "query-scheduler-ring",
      "memberlist-kv",
      "cache-generation-loader",
      "ingester-querier",
    ];
    await checkLokiServices("loki-read", expectedServices, lokiRead);
  });

  test("Check services are running for loki-write", async () => {
    const expectedServices = [
      "ring",
      "store",
      "ingester",
      "distributor",
      "runtime-config",
      "server",
      "memberlist-kv",
    ];
    await checkLokiServices("loki-write", expectedServices, lokiWrite);
  });

  test("Check services are running for loki-backend", async () => {
    const expectedServices = [
      "compactor",
      "index-gateway",
      "ring",
      "query-scheduler-ring",
      "index-gateway-ring",
      "ingester-querier",
      "store",
      "server",
      "memberlist-kv",
      "runtime-config",
      "query-scheduler",
      "ruler",
    ];
    await checkLokiServices("loki-backend", expectedServices, lokiBackend);
  });

  test("Validate Loki Gateway is responsive", async () => {
    const response = await fetch(`${lokiGateway.url}`);
    expect(response.status).toBe(200);
  });

  test("Send log to Loki-gateway and validate it in Loki-read and Loki-write", async () => {
    const logMessage = "Test log via gateway";
    const labels = { job: "gateway-test", level: "info" };

    // Send log to loki-gateway
    const logEntry = {
      streams: [{ stream: labels, values: [[`${Date.now() * 1_000_000}`, logMessage]] }],
    };
    const response = await fetch(getLokiUrl("/loki/api/v1/push", lokiGateway), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logEntry),
    });

    expect(response.ok).toBe(true);

    // Validate the log appears in Loki-read
    const readData = await queryLogs(`{job="gateway-test"}`);
    validateLogInQuery(readData, logMessage);

    // Validate the log appears in Loki-write
    const writeData = await queryLogs(`{job="gateway-test"}`);
    validateLogInQuery(writeData, logMessage);
  });
});
