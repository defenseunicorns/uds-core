/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { execInPod } from "./helpers/k8s";

// Set timeout for all tests
vi.setConfig({ testTimeout: 30000 });

const CURL_GATEWAY = ["curl", "-s", "-w", " HTTP_CODE:%{http_code}", "https://demo-8080.uds.dev"];

function getCurlCommand(serviceName: string, namespaceName: string, port = 8080) {
  return [
    "curl",
    "-s",
    "-m",
    "3",
    "-w",
    " HTTP_CODE:%{http_code}",
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

// Check for HTTP error codes in test responses
// Used when checking if network calls were denied
// HTTP response status code reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
// Expects curlOutput.stdout to only contain a string indicating the HTTP response code
function isResponseError(curlOutput: { stdout: string; stderr: string }) {
  if (curlOutput.stderr) {
    return true;
  }

  const stdout = curlOutput.stdout ?? "";
  let httpResponseCode: number;

  // Prefer parsing a labeled HTTP code (e.g. ... HTTP_CODE:200) when present
  const labeledMatch = stdout.match(/HTTP_CODE:(\d{3})\s*$/);
  if (labeledMatch) {
    httpResponseCode = Number(labeledMatch[1]);
  } else {
    // Fallback for legacy usage where stdout is just the numeric status code
    httpResponseCode = Number(stdout);
  }

  // No valid number found during parsing, treat as an error
  if (Number.isNaN(httpResponseCode)) {
    return true;
  }

  return httpResponseCode < 100 || httpResponseCode > 399;
}

// Check if egress tests should run
const runEgressTests = process.env.EGRESS_TESTS === "true";

let curlPodName1 = "";
let testAdminApp = "";
let curlPodName6 = "";
let curlPodName8 = "";
let curlPodNameEgressAmbient1 = "";
let curlPodNameEgressAmbient2 = "";
let curlPodNameEgressAmbient3 = "";
let curlPodNameEgress1 = "";
let curlPodNameEgress2 = "";

beforeAll(async () => {
  // Always fetch these pod names
  curlPodName1 = await getPodName("curl-ns-deny-all-1", "app=curl-pkg-deny-all-1");
  testAdminApp = await getPodName("test-admin-app", "app=httpbin");
  curlPodName6 = await getPodName("curl-ns-remote-ns-1", "app=curl-pkg-remote-ns-egress");
  curlPodName8 = await getPodName("curl-ns-kube-api", "app=curl-pkg-kube-api");
  curlPodNameEgressAmbient1 = await getPodName("egress-ambient-1", "app=curl");
  curlPodNameEgressAmbient2 = await getPodName("egress-ambient-2", "app=curl");
  curlPodNameEgressAmbient3 = await getPodName("egress-ambient-2", "app=another-curl");

  // Only fetch egress pod names if egress tests will run
  if (runEgressTests) {
    curlPodNameEgress1 = await getPodName("egress-gw-1", "app=curl");
    curlPodNameEgress2 = await getPodName("egress-gw-2", "app=curl");
  }
});

describe("Network Policy Validation", { retry: 2 }, () => {
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
    "10",
    "-w",
    " HTTP_CODE:%{http_code}",
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
    const deniedExternalDebug = `Denied external response: stdout=${denied_external_response.stdout}, stderr=${denied_external_response.stderr}`;
    expect(isResponseError(denied_external_response), deniedExternalDebug).toBe(true);

    // Default deny when no Ingress or Egress for internal curl command
    const denied_internal_response = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      INTERNAL_CURL_COMMAND_1,
    );
    const deniedInternalDebug = `Denied internal response: stdout=${denied_internal_response.stdout}, stderr=${denied_internal_response.stderr}`;
    expect(isResponseError(denied_internal_response), deniedInternalDebug).toBe(true);

    // Default Deny for Google Curl when no Egress defined
    const denied_google_response = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      GOOGLE_CURL,
    );
    const deniedGoogleDebug = `Denied Google response: stdout=${denied_google_response.stdout}, stderr=${denied_google_response.stderr}`;
    expect(denied_google_response.stdout, deniedGoogleDebug).toContain("000");
  });

  test.concurrent("Basic Wide Open Ingress and Wide Open Egress", async () => {
    // Validate Curl between two pods is successful
    const success_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      INTERNAL_CURL_COMMAND_2,
    );
    const wideOpenIngressDebug = `Wide open ingress response: stdout=${success_response.stdout}, stderr=${success_response.stderr}`;
    expect(success_response.stdout, wideOpenIngressDebug).toContain("HTTP_CODE:200");

    const CURL_INTERNAL_8081 = [
      "curl",
      "-s",
      "-m",
      "3",
      "-w",
      " HTTP_CODE:%{http_code}",
      "http://curl-pkg-allow-all.curl-ns-allow-all.svc.cluster.local:8081",
    ];

    // Deny request when port is not allowed on ingress
    const denied_incorrect_port_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      CURL_INTERNAL_8081,
    );
    const deniedIncorrectPortDebug = `Denied incorrect port response: stdout=${denied_incorrect_port_response.stdout}, stderr=${denied_incorrect_port_response.stderr}`;
    expect(isResponseError(denied_incorrect_port_response), deniedIncorrectPortDebug).toBe(true);

    // Wide open Egress means successful google curl
    const successful_google_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      GOOGLE_CURL,
    );
    const wideOpenGoogleDebug = `Wide open Google response: stdout=${successful_google_response.stdout}, stderr=${successful_google_response.stderr}`;
    expect(successful_google_response.stdout, wideOpenGoogleDebug).toContain("HTTP_CODE:200");
  });

  test.concurrent("Ingress Gateway Bypass", async () => {
    const authservice_curl_header = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" -k -H "Authorization: foobar" http://httpbin.authservice-sidecar-test-app.svc.cluster.local:8000`,
    ];

    // Validate that request is not successful when using Ingress Gateway Bypass
    const failed_response2 = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      authservice_curl_header,
    );
    const ingressBypassDebug = `Ingress gateway bypass response: stdout=${failed_response2.stdout}, stderr=${failed_response2.stderr}`;
    expect(failed_response2.stdout, ingressBypassDebug).toContain("HTTP_CODE:403");
  });

  test.concurrent("RemoteNamespace Ingress and Egress", async () => {
    // Validate that request is successful when using RemoteNamespace
    const success_response = await execInPod(
      "curl-ns-remote-ns-1",
      curlPodName6,
      "curl-pkg-remote-ns-egress",
      INTERNAL_CURL_COMMAND_5,
    );
    const remoteNamespaceSuccessDebug = `RemoteNamespace response: stdout=${success_response.stdout}, stderr=${success_response.stderr}`;
    expect(success_response.stdout, remoteNamespaceSuccessDebug).toContain("HTTP_CODE:200");

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
    const remoteNamespaceDeniedPortDebug = `RemoteNamespace denied port response: stdout=${denied_port_response.stdout}, stderr=${denied_port_response.stderr}`;
    expect(isResponseError(denied_port_response), remoteNamespaceDeniedPortDebug).toBe(true);
  });

  test.concurrent("Kube API Restrictions", async () => {
    const kubeApi_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" -k -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null || echo '')" https://kubernetes.default.svc.cluster.local/api`,
    ];

    // Validate successful kubeApi request with token
    const success_unauthorized_response = await execInPod(
      "curl-ns-kube-api",
      curlPodName8,
      "curl-pkg-kube-api",
      kubeApi_curl,
    );
    const kubeApiSuccessDebug = `Kube API response: stdout=${success_unauthorized_response.stdout}, stderr=${success_unauthorized_response.stderr}`;
    expect(success_unauthorized_response.stdout, kubeApiSuccessDebug).toContain("HTTP_CODE:200");

    // Default Deny for Blocked Port
    const blocked_port_curl = getCurlCommand("curl-pkg-deny-all-2", "curl-ns-deny-all-2", 9999);
    const denied_port_response = await execInPod(
      "curl-ns-kube-api",
      curlPodName8,
      "curl-pkg-kube-api",
      blocked_port_curl,
    );
    const kubeApiDeniedPortDebug = `Kube API denied port response: stdout=${denied_port_response.stdout}, stderr=${denied_port_response.stderr}`;
    expect(isResponseError(denied_port_response), kubeApiDeniedPortDebug).toBe(true);
  });

  test.concurrent("RemoteCidr Restrictions", async () => {
    // Validate successful request when using RemoteCidr
    const success_response = await execInPod(
      "test-admin-app",
      testAdminApp,
      "curl",
      INTERNAL_CURL_COMMAND_7,
    );
    const remoteCidrSuccessDebug = `RemoteCidr response: stdout=${success_response.stdout}, stderr=${success_response.stderr}`;
    expect(success_response.stdout, remoteCidrSuccessDebug).toContain("HTTP_CODE:200");
  });

  test("Egress Ambient", { concurrent: true, retry: 3 }, async () => {
    // Wait 10 seconds for waypoint to be ready
    await new Promise(resolve => setTimeout(resolve, 10000));
    const egress_ambient_http_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" http://www.example.com`,
    ];

    const egress_ambient_tls_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" https://www.example.com`,
    ];

    // Validate successful tls request when using Egress for egress-ambient-1
    const success_response_tls = await execInPod(
      "egress-ambient-1",
      curlPodNameEgressAmbient1,
      "curl",
      egress_ambient_tls_curl,
    );

    const tlsDebugMessage = `TLS example.com curl failed: stdout=${success_response_tls.stdout}, stderr=${success_response_tls.stderr}`;

    expect(isResponseError(success_response_tls), tlsDebugMessage).toBe(false);

    // Validate denied http request when using Egress for egress-ambient-1
    const denied_response_http = await execInPod(
      "egress-ambient-1",
      curlPodNameEgressAmbient1,
      "curl",
      egress_ambient_http_curl,
    );
    const egressAmbientHttpDeniedDebug = `Egress Ambient HTTP denied response: stdout=${denied_response_http.stdout}, stderr=${denied_response_http.stderr}`;
    expect(isResponseError(denied_response_http), egressAmbientHttpDeniedDebug).toBe(true);

    // Validate denied request to Google when using Egress for egress-ambient-1
    const denied_google_response_1 = await execInPod(
      "egress-ambient-1",
      curlPodNameEgressAmbient1,
      "curl",
      GOOGLE_CURL,
    );
    const egressAmbientGoogleDeniedDebug = `Egress Ambient Google denied response 1: stdout=${denied_google_response_1.stdout}, stderr=${denied_google_response_1.stderr}`;
    expect(isResponseError(denied_google_response_1), egressAmbientGoogleDeniedDebug).toBe(true);

    // Validate allowed tls request to Google when using Egress with ServiceAccount in curl for curl-pkg-egress-ambient-2
    const success_response_google_tls = await execInPod(
      "egress-ambient-2",
      curlPodNameEgressAmbient2,
      "curl",
      GOOGLE_CURL,
    );
    const egressAmbientGoogleTlsSuccessDebug = `Egress Ambient Google TLS success: stdout=${success_response_google_tls.stdout}, stderr=${success_response_google_tls.stderr}`;
    expect(isResponseError(success_response_google_tls), egressAmbientGoogleTlsSuccessDebug).toBe(
      false,
    );

    // Validate denied tls request to Google when using Egress without ServiceAccount in another-curl for curl-pkg-egress-ambient-2
    const denied_response_google_tls = await execInPod(
      "egress-ambient-2",
      curlPodNameEgressAmbient3,
      "curl",
      GOOGLE_CURL,
    );
    const egressAmbientGoogleTlsDeniedDebug = `Egress Ambient Google TLS denied response: stdout=${denied_response_google_tls.stdout}, stderr=${denied_response_google_tls.stderr}`;
    expect(isResponseError(denied_response_google_tls), egressAmbientGoogleTlsDeniedDebug).toBe(
      true,
    );
  });

  test.concurrent(
    "Admin (Anywhere, ambient) can reach remoteHost defined in another namespace",
    async () => {
      const EXAMPLE_TLS = [
        "sh",
        "-c",
        `curl -s -w " HTTP_CODE:%{http_code}" https://www.example.com`,
      ];

      // Source: test-admin-app (Anywhere via app-admin-package, now ambient)
      // Target: www.example.com defined as remoteHost in egress-ambient-1
      const resp = await execInPod("test-admin-app", testAdminApp, "curl", EXAMPLE_TLS);
      const msg = `Admin Anywhere->remoteHost cross-ns: stdout=${resp.stdout}, stderr=${resp.stderr}`;
      expect(isResponseError(resp), msg).toBe(false);
    },
  );

  test.concurrent("Egress Ambient per-host isolation (centralized AP)", async () => {
    // egress-ambient-2 SA is allowed to Google TLS; it should not be allowed to api.github.com TLS
    const EXAMPLE_TLS_DENIED = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" https://www.example.com`,
    ];

    const resp = await execInPod(
      "egress-ambient-2",
      curlPodNameEgressAmbient2,
      "curl",
      EXAMPLE_TLS_DENIED,
    );
    const msg = `Egress Ambient per-host isolation (example.com denied for egress-ambient-2 SA): stdout=${resp.stdout}, stderr=${resp.stderr}`;
    expect(isResponseError(resp), msg).toBe(true);
  });

  test.concurrent(
    "Egress Ambient HTTP to github denied for SA with Google TLS access",
    async () => {
      const EXAMPLE_HTTP_DENIED = [
        "sh",
        "-c",
        `curl -s -w " HTTP_CODE:%{http_code}" http://www.example.com`,
      ];

      const resp = await execInPod(
        "egress-ambient-2",
        curlPodNameEgressAmbient2,
        "curl",
        EXAMPLE_HTTP_DENIED,
      );
      const msg = `Egress Ambient HTTP example.com denied for egress-ambient-2 SA: stdout=${resp.stdout}, stderr=${resp.stderr}`;
      expect(isResponseError(resp), msg).toBe(true);
    },
  );

  (runEgressTests ? test.concurrent : test.concurrent.skip)("Egress Gateway", async () => {
    const egress_gateway_http_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" http://example.com`,
    ];

    const egress_gateway_tls_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" https://example.com`,
    ];

    // Validate successful tls request when using Egress Gateway for egress-gw-1
    const success_response_tls = await execInPod(
      "egress-gw-1",
      curlPodNameEgress1,
      "curl",
      egress_gateway_tls_curl,
    );
    const egressGatewayTlsSuccessDebug = `Egress Gateway TLS success (egress-gw-1): stdout=${success_response_tls.stdout}, stderr=${success_response_tls.stderr}`;
    expect(isResponseError(success_response_tls), egressGatewayTlsSuccessDebug).toBe(false);

    // Validate denied http request when using Egress Gateway for egress-gw-1
    const denied_response_http = await execInPod(
      "egress-gw-1",
      curlPodNameEgress1,
      "curl",
      egress_gateway_http_curl,
    );
    const egressGatewayHttpDeniedDebug = `Egress Gateway HTTP denied (egress-gw-1): stdout=${denied_response_http.stdout}, stderr=${denied_response_http.stderr}`;
    expect(isResponseError(denied_response_http), egressGatewayHttpDeniedDebug).toBe(true);

    // Validate denied request to Google when using Egress Gateway for egress-gw-1
    const denied_google_response_1 = await execInPod(
      "egress-gw-1",
      curlPodNameEgress1,
      "curl",
      GOOGLE_CURL,
    );
    const egressGatewayGoogleDenied1Debug = `Egress Gateway Google denied (egress-gw-1): stdout=${denied_google_response_1.stdout}, stderr=${denied_google_response_1.stderr}`;
    expect(isResponseError(denied_google_response_1), egressGatewayGoogleDenied1Debug).toBe(true);

    // Validate denied tls request when using Egress Gateway for curl-pkg-egress-gw-2
    const denied_response_tls = await execInPod(
      "egress-gw-2",
      curlPodNameEgress2,
      "curl",
      egress_gateway_tls_curl,
    );
    const egressGatewayTlsDeniedDebug = `Egress Gateway TLS denied (egress-gw-2): stdout=${denied_response_tls.stdout}, stderr=${denied_response_tls.stderr}`;
    expect(isResponseError(denied_response_tls), egressGatewayTlsDeniedDebug).toBe(true);

    // Validate successful http request when using Egress Gateway for curl-pkg-egress-gw-2
    const success_response_http = await execInPod(
      "egress-gw-2",
      curlPodNameEgress2,
      "curl",
      egress_gateway_http_curl,
    );
    const egressGatewayHttpSuccessDebug = `Egress Gateway HTTP success (egress-gw-2): stdout=${success_response_http.stdout}, stderr=${success_response_http.stderr}`;
    expect(isResponseError(success_response_http), egressGatewayHttpSuccessDebug).toBe(false);

    // Validate denied request to Google when using Egress Gateway for curl-pkg-egress-gw-2
    const denied_google_response_2 = await execInPod(
      "egress-gw-2",
      curlPodNameEgress2,
      "curl",
      GOOGLE_CURL,
    );
    const egressGatewayGoogleDenied2Debug = `Egress Gateway Google denied (egress-gw-2): stdout=${denied_google_response_2.stdout}, stderr=${denied_google_response_2.stderr}`;
    expect(isResponseError(denied_google_response_2), egressGatewayGoogleDenied2Debug).toBe(true);
  });
});

test.concurrent("Keycloak AuthorizationPolicies", async () => {
  const SSO_CURL = [
    "curl",
    "-s",
    "-m",
    "3",
    "-w",
    " HTTP_CODE:%{http_code}",
    "https://sso.uds.dev/realms/master/.well-known/openid-configuration",
  ];

  const KEYCLOAK_CURL = [
    "curl",
    "-s",
    "-m",
    "3",
    "-w",
    " HTTP_CODE:%{http_code}",
    "https://keycloak-http.keycloak.svc.cluster.local:8080/realms/master/.well-known/openid-configuration",
  ];

  // Validate redirected request when hitting the external address
  const redirect_response = await execInPod("test-admin-app", testAdminApp, "curl", SSO_CURL);
  const keycloakRedirectDebug = `Keycloak SSO redirect response: stdout=${redirect_response.stdout}, stderr=${redirect_response.stderr}`;
  expect(redirect_response.stdout, keycloakRedirectDebug).toContain("HTTP_CODE:301");

  // Validate denied request when hitting the internal address
  const denied_keycloak_response = await execInPod(
    "test-admin-app",
    testAdminApp,
    "curl",
    KEYCLOAK_CURL,
  );
  const keycloakDeniedDebug = `Keycloak internal denied response: stdout=${denied_keycloak_response.stdout}, stderr=${denied_keycloak_response.stderr}`;
  expect(isResponseError(denied_keycloak_response), keycloakDeniedDebug).toBe(true);
});
