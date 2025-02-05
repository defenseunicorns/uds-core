/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, jest, test } from "@jest/globals";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

jest.setTimeout(30000);

// Namespace Constants
const NAMESPACE_CURL = "curl-test";
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

function getCurlCommand(serviceName: string, port = 8080) {
  return [
    "curl",
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    `http://${serviceName}.${NAMESPACE_CURL}.svc.cluster.local:${port}`,
  ];
}

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
async function execInPod(namespace: string, podName: string, containerName: string, command: string[]) {
  const cmd = `kubectl exec -n ${namespace} ${podName} -c ${containerName} -- ${command.join(" ")}`;
  try {
    const { stdout } = await execAsync(cmd);
    return { stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    return { stdout: "000", stderr: "Curl failed" };
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

let curlPodName1 = "";
let curlPodName3 = "";
let curlPodName4 = "";
let curlPodName6 = "";
let curlPodName8 = "";

beforeAll(async () => {
  curlPodName1 = await getPodName(NAMESPACE_CURL, "app=curl-1");
  curlPodName3 = await getPodName(NAMESPACE_CURL, "app=curl-3");
  curlPodName4 = await getPodName(NAMESPACE_CURL, "app=curl-4");
  curlPodName6 = await getPodName(NAMESPACE_CURL, "app=curl-6");
  curlPodName8 = await getPodName(NAMESPACE_CURL, "app=curl-8");
});

describe("Network Policy Validation", () => {
  const CURL_INTERNAL2 = getCurlCommand("curl-2");
  const CURL_INTERNAL5 = getCurlCommand("curl-5");
  const CURL_INTERNAL7 = getCurlCommand("curl-7");
  const CURL_INTERNAL9 = getCurlCommand("curl-9");

  const kubeApi_curl = [
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

  test("Block all traffic by default", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_EXTERNAL);
    expect(response.stdout).toBe("000");

    const responseInternal = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_INTERNAL2);
    expect(responseInternal.stdout).toBe("503");
  });

  test("Deny egress traffic when using an incorrect port", async () => {
    await patchResource(NAMESPACE_CURL, "curl-1", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl-1" }, ports: [9999] }],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_INTERNAL2);
    expect(response.stdout).toBe("503");
  });

  test("Deny egress traffic when label does not match", async () => {
    await patchResource(NAMESPACE_CURL, "curl-1", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "nonexistent-app" } }],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_INTERNAL2);
    expect(response.stdout).toBe("503");
  });

  test("Allow ingress but no egress: Should fail", async () => {

    await patchResource(NAMESPACE_CURL, "curl-2", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Ingress", selector: { app: "curl-2" }, ports: [8080], }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_INTERNAL2);
    expect(response.stdout).toBe("503");
  });

  test("Enable egress policy: Should succeed", async () => {
    await patchResource(NAMESPACE_CURL, "curl-1", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl-1" } }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_INTERNAL2);
    expect(response.stdout).toBe("200");
  });

  test("Deny egress when port is explicitly restricted", async () => {
    const CURL_INTERNAL_8081 = [
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "http://curl-2.curl-test.svc.cluster.local:8081",
    ];

    const response = await execInPod(NAMESPACE_CURL, curlPodName1, "curl-1", CURL_INTERNAL_8081);
    expect(response.stdout).toBe("503");
  });

  test("Deny all traffic when no network policies are defined", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName3, "curl-3", CURL_EXTERNAL);
    expect(response.stdout).toBe("000");
  });

  test("Allow egress to any destination when explicitly permitted", async () => {
    await patchResource(NAMESPACE_CURL, "curl-3", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Egress",
            remoteGenerated: "Anywhere",
            selector: { app: "curl-3" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName3, "curl-3", CURL_EXTERNAL);
    expect(response.stdout).toBe("200");
  });

  test("Deny ingress when egress policy is not defined", async () => {
    await patchResource(NAMESPACE_CURL, "curl-5", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Ingress",
            remoteNamespace: "curl-test",
            remoteSelector: { app: "curl-4" },
            selector: { app: "curl-5" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ], 5000);
    const response = await execInPod(NAMESPACE_CURL, curlPodName4, "curl-4", CURL_INTERNAL5);
    expect(response.stdout).toBe("503");
  });

  test("Allow egress to a specific namespace when ingress is allowed", async () => {
    await patchResource(NAMESPACE_CURL, "curl-4", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Egress",
            remoteNamespace: NAMESPACE_CURL,
            selector: { app: "curl-4" },
          },
        ],
      },
    ], 5000);
    const response = await execInPod(NAMESPACE_CURL, curlPodName4, "curl-4", CURL_INTERNAL5);
    expect(response.stdout).toBe("200");
  });

  test("Deny ingress by default when no ingress policy is applied", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName6, "curl-6", CURL_INTERNAL7);
    expect(response.stdout).toBe("503");
  });

  test("Deny egress when no matching ingress policy exists", async () => {
    await patchResource(NAMESPACE_CURL, "curl-6", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl-6" }, ports: [443, 8080, 80] }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName6, "curl-6", CURL_INTERNAL7);
    expect(response.stdout).toBe("503");
  });

  test("Allow ingress when both ingress and egress policies are correctly applied", async () => {
    await patchResource(NAMESPACE_CURL, "curl-7", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Ingress",
            remoteNamespace: "curl-test",
            remoteSelector: { app: "curl-6" },
            selector: { app: "curl-7" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName6, "curl-6", CURL_INTERNAL7);
    expect(response.stdout).toBe("200");
  });

  test("Block access to Kube API by default", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName8, "curl-8", kubeApi_curl);
    expect(response.stdout).toBe("000");
  });

  test("Allow egress to Kube API but expect 401 Unauthorized", async () => {
    await patchResource(NAMESPACE_CURL, "curl-8", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Egress",
            remoteGenerated: "KubeAPI",
            selector: { app: "curl-8" },
          },
        ],
      },
    ]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName8, "curl-8", kubeApi_curl);
    expect(response.stdout).toContain("401");
  });

  test("Revoke API Access: Should fail again", async () => {
    await patchResource(NAMESPACE_CURL, "curl-8", [{ op: "remove", path: "/spec/network/allow" }]);
    const response = await execInPod(NAMESPACE_CURL, curlPodName8, "curl-8", kubeApi_curl);
    expect(response.stdout).toBe("000");
  });

  test("Block access to RemoteCIDR by default", async () => {
    const response = await execInPod(NAMESPACE_CURL, curlPodName8, "curl-8", CURL_INTERNAL9);
    expect(response.stdout).toBe("503");
  });

  test("Add Egress Netpol: Should still fail (No Ingress)", async () => {
    await patchResource(NAMESPACE_CURL, "curl-8", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [{ direction: "Egress", selector: { app: "curl-8" }, ports: [443, 8080, 80] }],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName8, "curl-8", CURL_INTERNAL9);
    expect(response.stdout).toBe("503");
  });

  test("Enable RemoteCIDR policy: Should allow all traffic", async () => {
    await patchResource(NAMESPACE_CURL, "curl-9", [
      {
        op: "add",
        path: "/spec/network/allow",
        value: [
          {
            direction: "Ingress",
            remoteCidr: "0.0.0.0/0", // Allow all traffic
            selector: { app: "curl-9" },
            ports: [443, 8080, 80],
          },
        ],
      },
    ]);

    const response = await execInPod(NAMESPACE_CURL, curlPodName8, "curl-8", CURL_INTERNAL9);
    expect(response.stdout).toBe("200");
  });
});
