/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { PassThrough } from "stream";

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const core = kc.makeApiClient(k8s.CoreV1Api);
const exec = new k8s.Exec(kc);

// Pod logs functionality
export async function getPodLogs(
  namespace: string,
  podName: string,
  containerName?: string,
): Promise<string[]> {
  const logs = await core.readNamespacedPodLog({
    name: podName,
    namespace: namespace,
    container: containerName,
  });

  // logs is a string, so split into lines and filter out any trailing empty line
  return logs.split("\n").filter(line => line.length > 0);
}

export async function getAllLogsByLabelSelector(
  namespace: string,
  labelSelector: string,
  containerName?: string,
): Promise<string[]> {
  // Get all pods matching the label selector
  const podsResponse = await core.listNamespacedPod({
    namespace: namespace,
    labelSelector: labelSelector,
  });

  const allLogs: string[] = [];

  // Get logs from each pod
  for (const pod of podsResponse.items) {
    if (pod.metadata?.name) {
      const podLogs = await getPodLogs(namespace, pod.metadata.name, containerName);
      allLogs.push(...podLogs);
    }
  }

  return allLogs;
}

// Exec functionality
export async function execAndWait(
  namespace: string,
  podName: string,
  command: string[],
  container: string,
): Promise<void> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let status: k8s.V1Status | null = null;

  return new Promise<void>((resolve, reject) => {
    exec
      .exec(
        namespace,
        podName,
        container,
        command,
        stdout,
        stderr,
        null, // no stdin
        false, // not a TTY
        s => {
          status = s;
        },
      )
      .then(ws => {
        ws.on("error", reject);
        ws.on("close", () => {
          ws.on("close", () => {
            // Allow NonZeroExitCode (expected when path doesn't exist)
            if (status && status.status !== "Success" && status.reason !== "NonZeroExitCode") {
              return reject(
                new Error(`exec failed: ${status.reason ?? status.message ?? "unknown"}`),
              );
            }
            resolve();
          });
          resolve();
        });
      })
      .catch(reject);
  });
}

// Temporary pod management
interface TempPodConfig {
  name: string;
  namespace: string;
  image?: string;
  command?: string[];
}

export async function createTempPod(config: TempPodConfig): Promise<string> {
  const { name, namespace, image = "alpine:latest", command = ["sleep", "3600"] } = config;

  const podSpec: k8s.V1Pod = {
    metadata: {
      name,
      namespace,
      labels: {
        app: "temp-test-pod",
        "created-by": "uds-core-vitest",
      },
    },
    spec: {
      restartPolicy: "Never",
      containers: [
        {
          name: "main",
          image,
          command,
          resources: {
            requests: {
              cpu: "10m",
              memory: "32Mi",
            },
            limits: {
              cpu: "100m",
              memory: "128Mi",
            },
          },
        },
      ],
    },
  };

  // Create the pod
  await core.createNamespacedPod({ namespace, body: podSpec });

  // Wait for pod to be ready
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds timeout

  while (attempts < maxAttempts) {
    const pod = await core.readNamespacedPod({ name, namespace });

    if (pod.status?.phase === "Running") {
      return name;
    }

    if (pod.status?.phase === "Failed") {
      throw new Error(`Pod ${name} failed to start: ${pod.status.reason}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new Error(`Pod ${name} did not become ready within ${maxAttempts} seconds`);
}

export async function deleteTempPod(name: string, namespace: string): Promise<void> {
  try {
    await core.deleteNamespacedPod({ name, namespace });
  } catch (error) {
    // Ignore 404 errors - pod might already be deleted
    if (error instanceof Error && !error.message.includes("404")) {
      console.warn(`Failed to delete pod ${name}: ${error.message}`);
    }
  }
}

export async function withTempPod<T>(
  config: TempPodConfig,
  fn: (podName: string) => Promise<T>,
): Promise<T> {
  const podName = await createTempPod(config);

  try {
    return await fn(podName);
  } finally {
    await deleteTempPod(podName, config.namespace);
  }
}
