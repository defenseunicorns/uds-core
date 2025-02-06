/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, test } from "@jest/globals";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

jest.setTimeout(30000);

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

function getCurlCommand(serviceName: string, namespaceName: string, port = 8080) {
  return [
    "curl",
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    `http://${serviceName}.${namespaceName}.svc.cluster.local:${port}`,
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

let curlPodName1 = "";
let testAdminApp = "";
let curlPodName6 = "";
let curlPodName8 = "";

beforeAll(async () => {
  [
    curlPodName1,
    testAdminApp,
    curlPodName6,
    curlPodName8,
  ] = await Promise.all([
    getPodName("curl-test-1", "app=curl-1"),
    getPodName("test-admin-app", "app=httpbin"),
    getPodName("curl-test-4", "app=curl-6"),
    getPodName("curl-test-6", "app=curl-8"),
  ]);
});

describe("Network Policy Validation", () => {
  const INTERNAL_CURL_COMMAND_1 = getCurlCommand("curl-2", "curl-test-1");
  const INTERNAL_CURL_COMMAND_2 = getCurlCommand("curl-4", "curl-test-2");
  const INTERNAL_CURL_COMMAND_5 = getCurlCommand("curl-7", "curl-test-5");
  const INTERNAL_CURL_COMMAND_7 = getCurlCommand("curl-10", "curl-test-7");

  const GOOGLE_CURL = [
    "curl",
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "https://www.google.com",
  ];

  test.concurrent("Denied Requests by Default and Incorrect Ports and Labels", async () => {
    // Default Deny when no Ingress or Egress defined or Exposed Endpoints
    const denied_external_response = await execInPod("curl-test-1", curlPodName1, "curl-1", CURL_EXTERNAL);
    expect(denied_external_response.stdout).toBe("000");

    // Default deny when no Ingress or Egress for internal curl command
    const denied_internal_response = await execInPod("curl-test-1", curlPodName1, "curl-1", INTERNAL_CURL_COMMAND_1);
    expect(denied_internal_response.stdout).toBe("503");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod("curl-test-1", curlPodName1, "curl-1", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-2", "curl-test-1", 9999);
    const denied_port_response = await execInPod("curl-test-1", curlPodName1, "curl-1", blocked_port_curl);
    expect(denied_port_response.stdout).toBe("503");
  });

  test.concurrent("Basic Wide Open Ingress and Wide Open Egress", async () => {
    // Validate Curl between two pods is successful
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", INTERNAL_CURL_COMMAND_2);
    expect(success_response.stdout).toBe("200");

    const CURL_INTERNAL_8081 = [
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "http://curl-4.curl-test-2.svc.cluster.local:8081",
    ];

    // Deny request when port is not allowed on ingress
    const denied_incorrect_port_response = await execInPod("test-admin-app", testAdminApp, "curl", CURL_INTERNAL_8081);
    expect(denied_incorrect_port_response.stdout).toBe("503");

    // Default Deny for undefined Ingress port
    const blocked_port_curl = getCurlCommand("curl-4", "curl-test-2", 9999);
    const denied_port_response = await execInPod("test-admin-app", testAdminApp, "curl", blocked_port_curl);
    expect(denied_port_response.stdout).toBe("503");

    // Wide open Egress means successful google curl
    const successful_google_response = await execInPod("test-admin-app", testAdminApp, "curl", GOOGLE_CURL);
    expect(successful_google_response.stdout).toBe("200");
  });

  test.concurrent("Anywhere Egress", async () => {
    // Validate that request is successful when Egress Anywhere is used
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", CURL_EXTERNAL);
    expect(success_response.stdout).toBe("200");

    // Validate Egress to Google is successful
    const successful_google_response = await execInPod("test-admin-app", testAdminApp, "curl", GOOGLE_CURL);
    expect(successful_google_response.stdout).toBe("200");
  });

  test.concurrent("RemoteNamespace Ingress and Egress", async () => {
    // Validate that request is successful when using RemoteNamespace
    const success_response = await execInPod("curl-test-4", curlPodName6, "curl-6", INTERNAL_CURL_COMMAND_5);
    expect(success_response.stdout).toBe("200");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod("curl-test-4", curlPodName6, "curl-6", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-7", "curl-test-5", 9999);
    const denied_port_response = await execInPod("curl-test-4", curlPodName6, "curl-6", blocked_port_curl);
    expect(denied_port_response.stdout).toBe("503");
  });

  test.concurrent("Kube API Restrictions", async () => {
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
      `https://kubernetes.default.svc.cluster.local/api/v1/namespaces`,
    ];

    // Validate unauthorized response when using Kube API ( because of missing authorization token )
    const success_unauthorized_response = await execInPod("curl-test-6", curlPodName8, "curl-8", kubeApi_curl);
    expect(success_unauthorized_response.stdout).toContain("401");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod("curl-test-6", curlPodName8, "curl-8", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-2", "curl-test-1", 9999);
    const denied_port_response = await execInPod("curl-test-6", curlPodName8, "curl-8", blocked_port_curl);
    expect(denied_port_response.stdout).toBe("503");
  });

  test.concurrent("RemoteCidr Restrictions", async () => {
    // Validate successful request when using RemoteCidr
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", INTERNAL_CURL_COMMAND_7);
    expect(success_response.stdout).toBe("200");

    // Validate successful request to Google because of wide open remoteCidr
    const denied_google_response = await execInPod("test-admin-app", testAdminApp, "curl", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("200");
  });
});
