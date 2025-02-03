/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, jest, test } from "@jest/globals";
import { Exec, KubeConfig } from "@kubernetes/client-node";
import { exec } from "child_process";
import { Writable } from "stream";
import { promisify } from "util";

const execAsync = promisify(exec);

jest.setTimeout(10000);

// Namespace Constants
const NAMESPACE_CURL = "curl-test";
const NAMESPACE_TENANT_APP = "test-tenant-app";
const KUBE_API_URL = "https://kubernetes.default.svc.cluster.local";

// Curl Commands
const CURL_EXTERNAL = [
  "curl",
  "-s",
  "-o",
  "/dev/null",
  "-w",
  "%{http_code}",
  "https://demo-8080.uds.dev",
];
const CURL_INTERNAL = [
  "curl",
  "-s",
  "-o",
  "/dev/null",
  "-w",
  "%{http_code}",
  "http://test-tenant-app.test-tenant-app.svc.cluster.local:8080",
];

let curlPodName = "";

// Retrieve pod name dynamically
async function getPodName(namespace: string, labelSelector: string): Promise<string> {
  const command = `kubectl get pods -n ${namespace} -l ${labelSelector} -o jsonpath="{.items[0].metadata.name}"`;
  try {
    const { stdout } = await execAsync(command);
    const podName = stdout.trim();
    if (!podName) {
      throw new Error(`No pods found in namespace '${namespace}' with label '${labelSelector}'`);
    }
    return podName;
  } catch (error) {
    throw new Error(
      `Failed to retrieve pod name: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Execute commands inside a pod
async function execInPod(
  namespace: string,
  podName: string,
  containerName: string,
  command: string[],
): Promise<{ stdout: string; stderr: string }> {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const exec = new Exec(kc);

  let stdoutData = "",
    stderrData = "";
  const stdoutStream = new Writable({
    write(chunk, encoding, callback) {
      stdoutData += chunk.toString();
      callback();
    },
  });
  const stderrStream = new Writable({
    write(chunk, encoding, callback) {
      stderrData += chunk.toString();
      callback();
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      void exec.exec(
        namespace,
        podName,
        containerName,
        command,
        stdoutStream,
        stderrStream,
        null,
        false,
        status => {
          if (status?.status === "Success") {
            resolve();
          } else {
            reject(new Error(`Command failed: ${status?.message || "Unknown error"}`));
          }
        },
      );
    });
    return { stdout: stdoutData.trim(), stderr: stderrData.trim() };
  } catch (error) {
    return { stdout: "000", stderr: "Curl failed" }; // Standardizing failure response
  }
}

// Patch a resource with an optional wait time
async function patchResource(
  namespace: string,
  name: string,
  patchPayload: object[],
  waitTime = 3000,
): Promise<void> {
  const patchJson = JSON.stringify(patchPayload);
  const command = `kubectl patch package ${name} -n ${namespace} --type=json -p='${patchJson}'`;
  await execAsync(command);
  await new Promise(resolve => setTimeout(resolve, waitTime)); // Allow changes to propagate
}

beforeAll(async () => {
  curlPodName = await getPodName(NAMESPACE_CURL, "app=curl");
});

/*
  Ensure the standard Egress + Ingress combined (end-to-end communication)
*/
describe("Standard Ingress Egress Flow", () => {
  test("Allow both Ingress and Egress to enable communication", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl" } }],
      },
    ]);
    await patchResource(NAMESPACE_TENANT_APP, "test-tenant-app", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Ingress", selector: { app: "test-tenant-app" } }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("200");
  });
});

/*
  Validate Default-Deny-All (No Policies Applied)
*/
describe("Default Deny-All Enforcement", () => {
  test("Default state should block ALL traffic", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_EXTERNAL);
    expect(response.stdout).toBe("000");

    const responseInternal = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(responseInternal.stdout).toBe("503");
  });
});

/*
  Ensures requests are blocked to exposed Endpoints without Egress Policy
  Applies Egress Policy, confirms request succeeds
*/
describe("Egress Anywhere Restrictions", () => {
  test("Baseline: No netpols defined, all curls should fail", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_EXTERNAL);
    expect(response.stdout).toBe("000");
  });

  test("Allow Egress Anywhere: Should succeed due to exposed endpoint", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Egress",
            remoteGenerated: "Anywhere",
            selector: { app: "curl" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_EXTERNAL);
    expect(response.stdout).toBe("200");
  });
});

/*
  Ensures Egress requests are only allowed to a specific namespaces
*/
describe("Egress to Specific Namespace", () => {
  test("Ingress Policy without Egress Policy, should fail", async () => {
    await patchResource(NAMESPACE_TENANT_APP, "test-tenant-app", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Ingress",
            remoteNamespace: "curl-test",
            remoteSelector: { app: "curl" },
            selector: { app: "test-tenant-app" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });

  test("Egress to test-tenant-app namespace with Ingress Policy, should succeed", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Egress",
            remoteNamespace: NAMESPACE_TENANT_APP,
            selector: { app: "curl" },
          },
        ],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("200");
  });
});

/*
  Ensures requests are blocked without Internal Ingress and Egress Policies
  Applies Egress Policy, confirms request fails due to no Ingress Policy
  Applies Ingress Policy, confirms request succeeds
*/
describe("Internal Network Restrictions", () => {
  test("Baseline: No Ingress Netpol, should fail", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });

  test("Add Egress Netpol: Should still fail (No Ingress)", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl" }, ports: [443, 8080, 80] }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });

  test("Add Ingress Netpol: Should succeed now", async () => {
    await patchResource(NAMESPACE_TENANT_APP, "test-tenant-app", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Ingress",
            remoteNamespace: "curl-test",
            remoteSelector: { app: "curl" },
            selector: { app: "test-tenant-app" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("200");
  });
});

/*
  Negative test: Allow wrong port, request should fail
*/
describe("Incorrect Port Should Fail", () => {
  test("Egress is allowed only on wrong port, should fail", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl" }, ports: [9999] }],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });
});

/*
  Negative test: Wrong pod labels should fail
*/
describe("Wrong Pod Labels Should Fail", () => {
  test("Egress policy does not match pod label, should fail", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "nonexistent-app" } }],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });
});

/*
  Ensures requests are blocked without RemoteCidr Policy
  Applies RemoteCidr Policy ( 0.0.0.0/0 => allow all traffic ) and confirms connectivity
*/
describe("RemoteCIDR Network Restrictions", () => {
  test("Baseline: No RemoteCIDR policy, curl should fail", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });

  test("Add Egress Netpol: Should still fail (No Ingress)", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl" }, ports: [443, 8080, 80] }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("503");
  });

  test("Add RemoteCIDR Policy: Curl should succeed", async () => {
    await patchResource(NAMESPACE_TENANT_APP, "test-tenant-app", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Ingress",
            remoteCidr: "0.0.0.0/0", // Allow all traffic
            selector: { app: "test-tenant-app" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", CURL_INTERNAL);
    expect(response.stdout).toBe("200");
  });
});

/*
  Ensures requests are blocked without KubeAPI Policy
  Applies KubeAPI Policy, confirms request is successful with an expected 401 Unauthorized response
  Revokes API Access and confirms the request fails again
*/
describe("KubeAPI Network Restrictions", () => {
  const curlCommand = [
    "curl",
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "-k",
    "-H",
    "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)",
    `${KUBE_API_URL}/api/v1/namespaces`,
  ];

  test("Baseline: No explicit KubeAPI egress, should fail", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", curlCommand);
    expect(response.stdout).toBe("000");
  });

  test("Allow Egress to KubeAPI: Should receive 401 unauthorized", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Egress",
            remoteGenerated: "KubeAPI",
            selector: { app: "curl" },
          },
        ],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", curlCommand);
    expect(response.stdout).toBe("401");
  });

  test("Revoke API Access: Should fail again", async () => {
    await patchResource(NAMESPACE_CURL, "curl", [{ op: "remove", path: "/spec/network/allow" }]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName, "curl", curlCommand);
    expect(response.stdout).toBe("000");
  });
});
