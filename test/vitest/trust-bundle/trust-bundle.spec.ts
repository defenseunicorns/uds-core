/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { execInPod } from "../helpers/k8s";

// Set timeout for all tests
vi.setConfig({ testTimeout: 30000 });

const namespace = "trust-bundle-tests-1";
const labelSelector = "app=trust-bundle-tests-1";

// Helper function to get pod name dynamically
async function getPodName(): Promise<string> {
  const pods = await K8s(kind.Pod).InNamespace(namespace).WithLabel(labelSelector).Get();
  const podName = pods.items[0]?.metadata?.name;
  if (!podName) {
    throw new Error(`No pods found in namespace '${namespace}' with label '${labelSelector}'`);
  }
  return podName;
}

beforeAll(async () => {
  // Wait for deployment to be ready
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds timeout

  while (attempts < maxAttempts) {
    try {
      // Check if deployment exists and is ready
      const deployment = await K8s(kind.Deployment)
        .InNamespace(namespace)
        .Get("trust-bundle-tests-deployment-1");

      if (deployment.status?.readyReplicas === deployment.spec?.replicas) {
        // Also verify pods are actually running and ready
        const pods = await K8s(kind.Pod).InNamespace(namespace).WithLabel(labelSelector).Get();
        const pod = pods.items[0];

        if (pod?.status?.phase === "Running") {
          const ready = pod.status.containerStatuses?.every(status => status.ready) ?? false;
          if (ready) {
            break;
          }
        }
      }
    } catch {
      // Deployment might not exist yet, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error("Deployment did not become ready within timeout");
  }
});

describe("Trust Bundle Tests", () => {
  test("container with public certs should successfully reach google.com", async () => {
    // Get the actual pod name from the deployment
    const podName = await getPodName();
    const containerName = "trust-bundle-test-with-public-certs";

    // Try to curl google.com - should succeed with public certs and return HTTP status
    const result = await execInPod(namespace, podName, containerName, [
      "curl",
      "-sL",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--max-time",
      "10",
      "https://google.com",
    ]);

    // Should succeed with exit code 0 and return HTTP 200
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("200");
  });

  test("container with empty certs should fail to reach google.com", async () => {
    // Get the actual pod name from the deployment
    const podName = await getPodName();
    const containerName = "trust-bundle-test-with-no-public-certs";

    // Try to curl google.com - should fail without public certs
    const result = await execInPod(namespace, podName, containerName, [
      "curl",
      "-s",
      "--max-time",
      "10",
      "https://google.com",
    ]);

    // Exit code 60 indicates SSL connect error in curl
    // CURLE_PEER_FAILED_VERIFICATION (60) The remote server's SSL certificate or SSH fingerprint was deemed not OK.
    expect(result.exitCode).toBe(60);
  });
});
