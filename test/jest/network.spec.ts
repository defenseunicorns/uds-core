/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, test } from "@jest/globals";
import { Exec, KubeConfig } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Writable } from "stream";

jest.setTimeout(30000);

const CURL_GATEWAY = [
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
    "-m",
    "3",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    `http://${serviceName}.${namespaceName}.svc.cluster.local:${port}`,
  ];
}

// Retrieve pod name dynamically
async function getPodName(namespace: string, labelSelector: string): Promise<string> {
  const pod = await K8s(kind.Pod).InNamespace(namespace).WithLabel(labelSelector).Get();
  try {
    const podName = pod.items[0].metadata?.name?.trim();
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
  command: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const exec = new Exec(kc);

  let stdoutBuffer = "";
  let stderrBuffer = "";

  return new Promise((resolve) => {
    exec.exec(
      namespace,
      podName,
      containerName,
      command,
      new Writable({
        write(chunk, encoding, callback) {
          stdoutBuffer += chunk.toString();
          callback();
        },
      }),
      new Writable({
        write(chunk, encoding, callback) {
          stderrBuffer += chunk.toString();
          callback();
        },
      }),
      null,
      false,
      (exitResponse: any) => {
        let exitCode = 0; // Default to success

        if (exitResponse && typeof exitResponse === "object") {
          if (exitResponse.status === "Failure") {
            // Extract exit code from `details.causes` array if available
            exitCode =
              parseInt(exitResponse.details?.causes?.find((cause: { reason: string; }) => cause.reason === "ExitCode")?.message || "1", 10);
          }
        } else if (typeof exitResponse === "number") {
          exitCode = exitResponse;
        } else {
          exitCode = 1; // Default to failure
        }

        resolve({
          stdout: exitCode !== 0 ? "000" : stdoutBuffer.trim(),
          stderr: stderrBuffer.trim(),
          exitCode,
        });
      }
    );
  });
}

// Check for HTTP error codes in test responses
// Used when checking if network calls were denied
// HTTP response status code reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
// Expects curlOutput.stdout to only contain a string indicating the HTTP response code
function isResponseError(curlOutput: { stdout: string, stderr: string }) {
  if (!curlOutput.stderr) {
    const httpResponseCode = Number(curlOutput.stdout) ?? 0
    if (httpResponseCode < 100 || httpResponseCode > 399) {
      return true
    } else {
      return false
    }
  } else {
    return true
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
    getPodName("curl-ns-deny-all", "app=curl-pkg-deny-all-1"),
    getPodName("test-admin-app", "app=httpbin"),
    getPodName("curl-ns-remote-ns-1", "app=curl-pkg-remote-ns-egress"),
    getPodName("curl-ns-kube-api", "app=curl-pkg-kube-api"),
  ]);
});

describe("Network Policy Validation", () => {
  const INTERNAL_CURL_COMMAND_1 = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all");
  const INTERNAL_CURL_COMMAND_2 = getCurlCommand("curl-pkg-allow-all", "curl-ns-allow-all");
  const INTERNAL_CURL_COMMAND_5 = getCurlCommand("curl-pkg-remote-ns-ingress", "curl-ns-remote-ns-2");
  const INTERNAL_CURL_COMMAND_7 = getCurlCommand("curl-pkg-remote-cidr", "curl-ns-remote-cidr");

  const GOOGLE_CURL = [
    "curl",
    "-s",
    "-m",
    "3",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "https://www.google.com",
  ];

  test.concurrent("Denied Requests by Default and Incorrect Ports and Labels", async () => {
    // Default Deny when no Ingress or Egress defined or Exposed Endpoints
    // The HTTP response code could either be 000 or 503, depending on the K8s distro
    const denied_external_response = await execInPod("curl-ns-deny-all", curlPodName1, "curl-pkg-deny-all-1", CURL_GATEWAY);
    expect(isResponseError(denied_external_response)).toBe(true);

    // Default deny when no Ingress or Egress for internal curl command
    const denied_internal_response = await execInPod("curl-ns-deny-all", curlPodName1, "curl-pkg-deny-all-1", INTERNAL_CURL_COMMAND_1);
    expect(isResponseError(denied_internal_response)).toBe(true);

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod("curl-ns-deny-all", curlPodName1, "curl-pkg-deny-all-1", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all", 9999);
    const denied_port_response = await execInPod("curl-ns-deny-all", curlPodName1, "curl-pkg-deny-all-1", blocked_port_curl);
    expect(isResponseError(denied_port_response)).toBe(true);
  });

  test.concurrent("Basic Wide Open Ingress and Wide Open Egress", async () => {
    // Validate Curl between two pods is successful
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", INTERNAL_CURL_COMMAND_2);
    expect(success_response.stdout).toBe("200");

    const CURL_INTERNAL_8081 = [
      "curl",
      "-s",
      "-m",
      "3",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "http://curl-pkg-allow-all.curl-ns-allow-all.svc.cluster.local:8081",
    ];

    // Deny request when port is not allowed on ingress
    const denied_incorrect_port_response = await execInPod("test-admin-app", testAdminApp, "curl", CURL_INTERNAL_8081);
    expect(isResponseError(denied_incorrect_port_response)).toBe(true);

    // Default Deny for undefined Ingress port
    const blocked_port_curl = getCurlCommand("curl-pkg-allow-all", "curl-ns-allow-all", 9999);
    const denied_port_response = await execInPod("test-admin-app", testAdminApp, "curl", blocked_port_curl);
    expect(isResponseError(denied_port_response)).toBe(true);

    // Wide open Egress means successful google curl
    const successful_google_response = await execInPod("test-admin-app", testAdminApp, "curl", GOOGLE_CURL);
    expect(successful_google_response.stdout).toBe("200");
  });

  test.concurrent("Anywhere Egress", async () => {
    // Validate that request is successful when Egress Anywhere is used
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", CURL_GATEWAY);
    expect(success_response.stdout).toBe("200");

    // Validate Egress to Google is successful
    const successful_google_response = await execInPod("test-admin-app", testAdminApp, "curl", GOOGLE_CURL);
    expect(successful_google_response.stdout).toBe("200");
  });

  test.concurrent("Ingress Gateway Bypass", async () => {
    const authservice_curl_header = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" -k -H "Authorization: foobar" http://httpbin.authservice-test-app.svc.cluster.local:8000`
    ];

    const authservice_curl = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" http://httpbin.authservice-test-app.svc.cluster.local:8000`
    ];

    // Validate that request is not success when using Ingress Gateway Bypass
    const failed_response = await execInPod("test-admin-app", testAdminApp, "curl", authservice_curl);
    expect(failed_response.stdout).toBe("403");

    // Validate that request is not successful when using Ingress Gateway Bypass
    const failed_response2 = await execInPod("test-admin-app", testAdminApp, "curl", authservice_curl_header);
    expect(failed_response2.stdout).toBe("403");
  });

  test.concurrent("RemoteNamespace Ingress and Egress", async () => {
    // Validate that request is successful when using RemoteNamespace
    const success_response = await execInPod("curl-ns-remote-ns-1", curlPodName6, "curl-pkg-remote-ns-egress", INTERNAL_CURL_COMMAND_5);
    expect(success_response.stdout).toBe("200");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod("curl-ns-remote-ns-1", curlPodName6, "curl-pkg-remote-ns-egress", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-pkg-remote-ns-ingress", "curl-ns-remote-ns-2", 9999);
    const denied_port_response = await execInPod("curl-ns-remote-ns-1", curlPodName6, "curl-pkg-remote-ns-egress", blocked_port_curl);
    expect(isResponseError(denied_port_response)).toBe(true);
  });

  test.concurrent("Kube API Restrictions", async () => {
    const kubeApi_curl = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" -k -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null || echo '')" https://kubernetes.default.svc.cluster.local/api`
    ];

    // Validate successful kubeApi request with token
    const success_unauthorized_response = await execInPod("curl-ns-kube-api", curlPodName8, "curl-pkg-kube-api", kubeApi_curl);
    expect(success_unauthorized_response.stdout).toContain("200");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod("curl-ns-kube-api", curlPodName8, "curl-pkg-kube-api", GOOGLE_CURL);
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all", 9999);
    const denied_port_response = await execInPod("curl-ns-kube-api", curlPodName8, "curl-pkg-kube-api", blocked_port_curl);
    expect(denied_port_response.stdout).not.toBe("200");
  });

  test.concurrent("RemoteCidr Restrictions", async () => {
    // Validate successful request when using RemoteCidr
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", INTERNAL_CURL_COMMAND_7);
    expect(success_response.stdout).toBe("200");

    // Validate successful request to Google because of wide open remoteCidr
    const success_google_response = await execInPod("test-admin-app", testAdminApp, "curl", GOOGLE_CURL);
    expect(success_google_response.stdout).toBe("200");
  });
});
