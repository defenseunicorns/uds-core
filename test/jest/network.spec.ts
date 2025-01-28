/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, test } from "@jest/globals";
import { Exec, KubeConfig } from "@kubernetes/client-node";
import { exec } from "child_process";
import { Writable } from "stream";
import { promisify } from "util";

const execAsync = promisify(exec);

// Configuration object
const config = {
  namespace: "test-tenant-app",
  resourceName: "test-tenant-app",
  curlNamespace: "curl-test",
  curlPodName: "curl",
  curlContainerName: "curl",
};

// Type definition for the Package resource
interface PackageExpose {
  service: string;
  selector: { app: string };
  gateway: string;
  host: string;
  port: number;
}

interface PackageNetwork {
  expose: PackageExpose[];
}

interface PackageResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
    [key: string]: unknown; // General-purpose metadata
  };
  spec: {
    network: PackageNetwork;
  };
  status?: Record<string, unknown>; // Additional status information
  [key: string]: unknown; // Allow for unknown properties
}

// Helper function to execute commands in a pod
async function execInPod(
  namespace: string,
  podName: string,
  containerName: string,
  command: string[],
): Promise<{ stdout: string; stderr: string }> {
  const kc = new KubeConfig();
  kc.loadFromDefault();

  const exec = new Exec(kc);
  let stdoutData = "";
  let stderrData = "";

  const stdoutStream = new Writable({
    write(chunk, encoding, callback) {
      stdoutData += chunk.toString();
      callback(null);
    },
  });

  const stderrStream = new Writable({
    write(chunk, encoding, callback) {
      stderrData += chunk.toString();
      callback(null);
    },
  });

  await new Promise<void>((resolve, reject) => {
    // Use void to explicitly ignore the exec.exec return value (if any)
    void exec.exec(
      namespace,
      podName,
      containerName,
      command,
      stdoutStream,
      stderrStream,
      null, // No stdin required
      false, // Disable TTY
      status => {
        if (status.status === "Success") {
          resolve(); // Mark promise as resolved on success
        } else {
          reject(new Error(`Command failed: ${status.message}`)); // Reject on failure
        }
      },
    );
  });

  return { stdout: stdoutData.trim(), stderr: stderrData.trim() };
}

// Helper function to fetch the current state of a resource
async function getResource(namespace: string, name: string): Promise<PackageResource> {
  const command = `kubectl get package ${name} -n ${namespace} -o json`;
  const { stdout, stderr } = await execAsync(command);

  if (stderr) {
    console.error("Error fetching resource:", stderr);
    throw new Error(stderr);
  }

  return JSON.parse(stdout) as PackageResource; // Ensure proper typing
}

// Helper function to patch the resource
async function patchResource(
  namespace: string,
  name: string,
  patchPayload: object[],
): Promise<void> {
  const patchJson = JSON.stringify(patchPayload);
  const command = `
        kubectl patch package ${name} -n ${namespace} --type=json -p='${patchJson}'
    `.trim();

  const { stderr } = await execAsync(command);

  if (stderr) {
    console.error("Error patching resource:", stderr);
    throw new Error(stderr);
  }
}

// Function to create patch payloads
function createExposePatch(service: string, host: string, port: number): object[] {
  return [
    {
      op: "replace",
      path: "/spec/network",
      value: {
        expose: [
          {
            service,
            selector: { app: service },
            gateway: "tenant",
            host,
            port,
          },
        ],
      },
    },
  ];
}

// Test suite
describe("E2E Test Network Restrictions", () => {
  test("should restrict access upon removing exposed network entry", async () => {
    const { curlNamespace, curlPodName, curlContainerName, namespace, resourceName } = config;

    const curlCommand = [
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "https://demo-8080.uds.dev",
    ];

    // Validate the service is reachable (200)
    const { stdout: initialStdout } = await execInPod(
      curlNamespace,
      curlPodName,
      curlContainerName,
      curlCommand,
    );
    expect(initialStdout).toBe("200");

    // Fetch original resource
    const originalResource = await getResource(namespace, resourceName);

    // Patch to restrict access, remove 8080 expose
    const patchPayload = createExposePatch("test-tenant-app", "demo-8081", 8081);
    await patchResource(namespace, resourceName, patchPayload);

    // Validate the service is no longer reachable at exposed 8080 (404)
    const { stdout: patchedStdout } = await execInPod(
      curlNamespace,
      curlPodName,
      curlContainerName,
      curlCommand,
    );
    expect(patchedStdout).toBe("404");

    // Revert to the original resource
    await patchResource(namespace, resourceName, [
      { op: "replace", path: "/spec/network", value: originalResource.spec.network },
    ]);
  });
});
