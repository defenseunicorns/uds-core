/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { K8s, kind } from "kubernetes-fluent-client";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";

let lokiRead: { server: net.Server; url: string };

const VECTOR_NAMESPACE = "vector";
const NODE_LOG_TEST_NAMESPACE = "vector-node-log-test";
const NODE_LOG_TEST_LABEL = "app.kubernetes.io/name=vector-node-log-writer";
const NODE_LOG_TEST_MESSAGE_PREFIX = "uds-core-vector-node-log-test";
const NODE_LOG_TEST_TIMEOUT = 60000;
const NODE_LOG_TEST_INTERVAL = 2000;

const getLokiUrl = (path: string, component: { url: string }) => `${component.url}${path}`;

const queryLogs = async (
  query: string,
  limit = 1,
): Promise<{
  status: string;
  data: { result: Array<{ values: string[][] }> };
}> => {
  const response = await fetch(
    getLokiUrl(
      `/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=${limit}`,
      lokiRead,
    ),
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(`Loki query failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as unknown as {
    status: string;
    data: { result: Array<{ values: string[][] }> };
  };
};

const hasLogLine = (
  queryData: {
    status: string;
    data: { result: Array<{ values: string[][] }> };
  },
  logMessage: string,
): boolean =>
  queryData.data.result.some(stream => stream.values.some(value => value.includes(logMessage)));

const getVectorNodeName = async (): Promise<string> => {
  const nodeName = (
    await K8s(kind.Pod)
      .InNamespace(VECTOR_NAMESPACE)
      .WithLabel("app.kubernetes.io/name", "vector")
      .Get()
  ).items.find(pod => pod.spec?.nodeName)?.spec?.nodeName;

  expect(nodeName).toBeDefined();
  return nodeName as string;
};

const getNodeLogMarker = async (
  nodeName: string,
): Promise<{ logs: Array<{ job: string; filename: string; message: string }> }> => {
  const writerPod = (
    await K8s(kind.Pod).InNamespace(NODE_LOG_TEST_NAMESPACE).WithLabel(NODE_LOG_TEST_LABEL).Get()
  ).items.find(pod => pod.spec?.nodeName === nodeName && pod.metadata?.uid);

  expect(writerPod).toBeDefined();

  const marker = `${NODE_LOG_TEST_MESSAGE_PREFIX}-${writerPod?.metadata?.uid}`;
  return {
    logs: [
      {
        job: "varlogs",
        filename: `/var/log/${marker}.log`,
        message: `${marker}-varlogs`,
      },
      {
        job: "kubernetes-logs",
        filename: `/var/log/kubernetes/${marker}.log`,
        message: `${marker}-kubernetes-logs`,
      },
    ],
  };
};

const validateNodeLog = async (
  nodeName: string,
  log: { job: string; filename: string; message: string },
): Promise<void> => {
  const data = await pollUntilSuccess(
    () =>
      queryLogs(
        `{collector="vector", job=${JSON.stringify(log.job)}, host=${JSON.stringify(nodeName)}, filename=${JSON.stringify(log.filename)}} |= ${JSON.stringify(log.message)}`,
      ),
    result => result.status === "success" && hasLogLine(result, log.message),
    `test package Vector ${log.job} node log with the expected host label to be available in Loki`,
    NODE_LOG_TEST_TIMEOUT,
    NODE_LOG_TEST_INTERVAL,
  );

  expect(data).toHaveProperty("status", "success");
  expect(hasLogLine(data, log.message)).toBe(true);
};

describe("Vector Node Log Tests", () => {
  beforeAll(async () => {
    lokiRead = await getForward("loki-read", "loki", 3100);
  }, 30000);

  afterAll(async () => {
    if (lokiRead) {
      await closeForward(lokiRead.server);
    }
  });

  test(
    "Validate Vector node-log host label",
    async () => {
      const nodeName = await getVectorNodeName();
      const { logs } = await getNodeLogMarker(nodeName);

      for (const log of logs) {
        await validateNodeLog(nodeName, log);
      }
    },
    NODE_LOG_TEST_TIMEOUT + 20000,
  );
});
