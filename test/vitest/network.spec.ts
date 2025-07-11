/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, test, vi } from "vitest";
import { Exec, KubeConfig } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Writable } from "stream";

// Set timeout for all tests
vi.setConfig({ testTimeout: 30000 });

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
  command: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  const exec = new Exec(kc);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (exitResponse: any) => {
        let exitCode = 0; // Default to success

        if (exitResponse && typeof exitResponse === "object") {
          if (exitResponse.status === "Failure") {
            // Extract exit code from `details.causes` array if available
            exitCode = parseInt(
              exitResponse.details?.causes?.find(
                (cause: { reason: string }) => cause.reason === "ExitCode",
              )?.message || "1",
              10,
            );
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
      },
    );
  });
}

// Check for HTTP error codes in test responses
// Used when checking if network calls were denied
// HTTP response status code reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
// Expects curlOutput.stdout to only contain a string indicating the HTTP response code
function isResponseError(curlOutput: { stdout: string; stderr: string }) {
  if (!curlOutput.stderr) {
    const httpResponseCode = Number(curlOutput.stdout);
    if (httpResponseCode < 100 || httpResponseCode > 399) {
      return true;
    } else {
      return false;
    }
  } else {
    return true;
  }
}

// Check if egress tests should run
const runEgressTests = process.env.EGRESS_TESTS === "true";

let curlPodName1 = "";
let testAdminApp = "";
let curlPodName6 = "";
let curlPodName8 = "";
let curlPodNameEgress1 = "";
let curlPodNameEgress2 = "";

beforeAll(async () => {
  // Always fetch these pod names
  curlPodName1 = await getPodName("curl-ns-deny-all-1", "app=curl-pkg-deny-all-1");
  testAdminApp = await getPodName("test-admin-app", "app=httpbin");
  curlPodName6 = await getPodName("curl-ns-remote-ns-1", "app=curl-pkg-remote-ns-egress");
  curlPodName8 = await getPodName("curl-ns-kube-api", "app=curl-pkg-kube-api");

  // Only fetch egress pod names if egress tests will run
  if (runEgressTests) {
    curlPodNameEgress1 = await getPodName("egress-gw-1", "app=curl");
    curlPodNameEgress2 = await getPodName("egress-gw-2", "app=curl");
  }
});

describe("Network Policy Validation", () => {
  const INTERNAL_CURL_COMMAND_1 = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all-2");
  const INTERNAL_CURL_COMMAND_2 = getCurlCommand("curl-pkg-allow-all", "curl-ns-allow-all");
  const INTERNAL_CURL_COMMAND_5 = getCurlCommand(
    "curl-pkg-remote-ns-ingress",
    "curl-ns-remote-ns-2",
  );
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
    const denied_external_response = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      CURL_GATEWAY,
    );
    expect(isResponseError(denied_external_response)).toBe(true);

    // Default deny when no Ingress or Egress for internal curl command
    const denied_internal_response = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      INTERNAL_CURL_COMMAND_1,
    );
    expect(isResponseError(denied_internal_response)).toBe(true);

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      GOOGLE_CURL,
    );
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all-2", 9999);
    const denied_port_response = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      blocked_port_curl,
    );
    expect(isResponseError(denied_port_response)).toBe(true);
  });

  test.concurrent("Basic Wide Open Ingress and Wide Open Egress", async () => {
    // Validate Curl between two pods is successful
    const success_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      INTERNAL_CURL_COMMAND_2,
    );
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
    const denied_incorrect_port_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      CURL_INTERNAL_8081,
    );
    expect(isResponseError(denied_incorrect_port_response)).toBe(true);

    // Default Deny for undefined Ingress port
    const blocked_port_curl = getCurlCommand("curl-pkg-allow-all", "curl-ns-allow-all", 9999);
    const denied_port_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      blocked_port_curl,
    );
    expect(isResponseError(denied_port_response)).toBe(true);

    // Wide open Egress means successful google curl
    const successful_google_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      GOOGLE_CURL,
    );
    expect(successful_google_response.stdout).toBe("200");
  });

  test.concurrent("Anywhere Egress", async () => {
    // Validate that request is successful when Egress Anywhere is used
    const success_response = await execInPod("test-admin-app", testAdminApp, "curl", CURL_GATEWAY);
    expect(success_response.stdout).toBe("200");

    // Validate Egress to Google is successful
    const successful_google_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      GOOGLE_CURL,
    );
    expect(successful_google_response.stdout).toBe("200");
  });

  test.concurrent("Ingress Gateway Bypass", async () => {
    const authservice_curl_header = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" -k -H "Authorization: foobar" http://httpbin.authservice-test-app.svc.cluster.local:8000`,
    ];

    const authservice_curl = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" http://httpbin.authservice-test-app.svc.cluster.local:8000`,
    ];

    // Validate that request is not success when using Ingress Gateway Bypass
    const failed_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      authservice_curl,
    );
    expect(failed_response.stdout).toBe("403");

    // Validate that request is not successful when using Ingress Gateway Bypass
    const failed_response2 = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      authservice_curl_header,
    );
    expect(failed_response2.stdout).toBe("403");
  });

  test.concurrent("RemoteNamespace Ingress and Egress", async () => {
    // Validate that request is successful when using RemoteNamespace
    const success_response = await execInPod(
      "curl-ns-remote-ns-1",
      curlPodName6,
      "curl-pkg-remote-ns-egress",
      INTERNAL_CURL_COMMAND_5,
    );
    expect(success_response.stdout).toBe("200");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod(
      "curl-ns-remote-ns-1",
      curlPodName6,
      "curl-pkg-remote-ns-egress",
      GOOGLE_CURL,
    );
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand(
      "curl-pkg-remote-ns-ingress",
      "curl-ns-remote-ns-2",
      9999,
    );
    const denied_port_response = await execInPod(
      "curl-ns-remote-ns-1",
      curlPodName6,
      "curl-pkg-remote-ns-egress",
      blocked_port_curl,
    );
    expect(isResponseError(denied_port_response)).toBe(true);
  });

  test.concurrent("Kube API Restrictions", async () => {
    const kubeApi_curl = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" -k -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null || echo '')" https://kubernetes.default.svc.cluster.local/api`,
    ];

    // Validate successful kubeApi request with token
    const success_unauthorized_response = await execInPod(
      "curl-ns-kube-api",
      curlPodName8,
      "curl-pkg-kube-api",
      kubeApi_curl,
    );
    expect(success_unauthorized_response.stdout).toContain("200");

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod(
      "curl-ns-kube-api",
      curlPodName8,
      "curl-pkg-kube-api",
      GOOGLE_CURL,
    );
    expect(denied_google_response.stdout).toBe("000");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all-2", 9999);
    const denied_port_response = await execInPod(
      "curl-ns-kube-api",
      curlPodName8,
      "curl-pkg-kube-api",
      blocked_port_curl,
    );
    expect(isResponseError(denied_port_response)).toBe(true);
  });

  test.concurrent("RemoteCidr Restrictions", async () => {
    // Validate successful request when using RemoteCidr
    const success_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      INTERNAL_CURL_COMMAND_7,
    );
    expect(success_response.stdout).toBe("200");

    // Validate successful request to Google because of wide open remoteCidr
    const success_google_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      GOOGLE_CURL,
    );
    expect(success_google_response.stdout).toBe("200");
  });

  (runEgressTests ? test.concurrent : test.concurrent.skip)("Egress Gateway", async () => {
    const egress_gateway_http_curl = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" http://example.com`,
    ];

    const egress_gateway_tls_curl = [
      "sh",
      "-c",
      `curl -s -o /dev/null -w "%{http_code}" https://example.com`,
    ];

    // Validate successful tls request when using Egress Gateway for egress-gw-1
    const success_response_tls = await execInPod(
      "egress-gw-1",
      curlPodNameEgress1,
      "curl",
      egress_gateway_tls_curl,
    );
    expect(isResponseError(success_response_tls)).toBe(false);

    // Validate denied http request when using Egress Gateway for egress-gw-1
    const denied_response_http = await execInPod(
      "egress-gw-1",
      curlPodNameEgress1,
      "curl",
      egress_gateway_http_curl,
    );
    expect(isResponseError(denied_response_http)).toBe(true);

    // Validate denied request to Google when using Egress Gateway for egress-gw-1
    const denied_google_response_1 = await execInPod(
      "egress-gw-1",
      curlPodNameEgress1,
      "curl",
      GOOGLE_CURL,
    );
    expect(isResponseError(denied_google_response_1)).toBe(true);

    // Validate denied tls request when using Egress Gateway for curl-pkg-egress-gw-2
    const denied_response_tls = await execInPod(
      "egress-gw-2",
      curlPodNameEgress2,
      "curl",
      egress_gateway_tls_curl,
    );
    expect(isResponseError(denied_response_tls)).toBe(true);

    // Validate successful http request when using Egress Gateway for curl-pkg-egress-gw-2
    const success_response_http = await execInPod(
      "egress-gw-2",
      curlPodNameEgress2,
      "curl",
      egress_gateway_http_curl,
    );
    expect(isResponseError(success_response_http)).toBe(false);

    // Validate denied request to Google when using Egress Gateway for curl-pkg-egress-gw-2
    const denied_google_response_2 = await execInPod(
      "egress-gw-2",
      curlPodNameEgress2,
      "curl",
      GOOGLE_CURL,
    );
    expect(isResponseError(denied_google_response_2)).toBe(true);
  });
});
