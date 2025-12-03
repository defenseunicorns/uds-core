/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { describe, expect, test, vi } from "vitest";
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
