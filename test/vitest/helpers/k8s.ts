/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { PassThrough, Writable } from "stream";

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

// Execute commands inside a pod with exit code support
export async function execInPod(
  namespace: string,
  podName: string,
  containerName: string,
  command: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const exec = new k8s.Exec(kc);

  let stdoutBuffer = "";
  let stderrBuffer = "";

  return new Promise(resolve => {
    void exec.exec(
      namespace,
      podName,
      containerName,
      command,
      new Writable({
        write(chunk, _encoding, callback) {
          stdoutBuffer += chunk.toString();
          callback();
        },
      }),
      new Writable({
        write(chunk, _encoding, callback) {
          stderrBuffer += chunk.toString();
          callback();
        },
      }),
      null,
      false,
      (
        exitResponse:
          | number
          | {
              status?: string;
              details?: { causes?: { reason?: string; message?: string }[] };
            }
          | undefined,
      ) => {
        let exitCode = 0; // Default to success

        if (exitResponse && typeof exitResponse === "object") {
          if (exitResponse.status === "Failure") {
            // Extract exit code from `details.causes` array if available
            exitCode = parseInt(
              exitResponse.details?.causes?.find(cause => cause?.reason === "ExitCode")?.message ||
                "1",
              10,
            );
          }
        } else if (typeof exitResponse === "number") {
          exitCode = exitResponse;
        } else {
          exitCode = 1; // Default to failure
        }

        resolve({
          stdout: stdoutBuffer.trim(),
          stderr: stderrBuffer.trim(),
          exitCode,
        });
      },
    );
  });
}

interface WaitForPodReadyConfig {
  name?: string;
  labelSelector?: string | Record<string, string>;
  containerName?: string;
  timeoutMs?: number;
  intervalMs?: number;
}

function toLabelSelector(labelSelector: string | Record<string, string>): string {
  if (typeof labelSelector === "string") {
    return labelSelector;
  }

  return Object.entries(labelSelector)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function isPodReady(pod: k8s.V1Pod, containerName?: string): boolean {
  if (pod.status?.phase !== "Running") {
    return false;
  }

  const containerStatuses = pod.status.containerStatuses ?? [];
  if (containerName) {
    return containerStatuses.some(status => status.name === containerName && status.ready);
  }

  return containerStatuses.length > 0 && containerStatuses.every(status => status.ready);
}

export async function waitForPodReady(
  namespace: string,
  config: WaitForPodReadyConfig,
): Promise<k8s.V1Pod> {
  const { name, labelSelector, containerName, timeoutMs = 120000, intervalMs = 2000 } = config;

  if (!name && !labelSelector) {
    throw new Error("waitForPodReady requires either name or labelSelector");
  }

  if (name && labelSelector) {
    throw new Error("waitForPodReady accepts name or labelSelector, not both");
  }

  const selector = labelSelector ? toLabelSelector(labelSelector) : undefined;
  const description = name
    ? `pod ${namespace}/${name}`
    : `pod in ${namespace} matching ${selector}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const pods = name
      ? [await core.readNamespacedPod({ namespace, name })]
      : (await core.listNamespacedPod({ namespace, labelSelector: selector })).items;

    for (const pod of pods) {
      const phase = pod.status?.phase;
      if (name && (phase === "Failed" || phase === "Succeeded")) {
        throw new Error(`${description} reached unexpected phase ${phase}`);
      }

      if (isPodReady(pod, containerName)) {
        return pod;
      }
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${description} to become ready`);
}

// Temporary pod management
interface TempPodConfig {
  name: string;
  namespace: string;
  image?: string;
  command?: string[];
  volumes?: k8s.V1Volume[];
  volumeMounts?: k8s.V1VolumeMount[];
  podSecurityContext?: k8s.V1PodSecurityContext;
}

export async function createTempPod(config: TempPodConfig): Promise<string> {
  const {
    name,
    namespace,
    image = "alpine:latest",
    command = ["sleep", "3600"],
    volumes,
    volumeMounts,
    podSecurityContext,
  } = config;

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
      securityContext: podSecurityContext,
      volumes,
      containers: [
        {
          name: "main",
          image,
          command,
          volumeMounts,
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

  await waitForPodReady(namespace, { name, timeoutMs: 30000, intervalMs: 1000 });
  return name;
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
