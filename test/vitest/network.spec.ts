/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as dgram from "node:dgram";
import * as k8s from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { execInPod } from "./helpers/k8s";

// Set timeout for all tests
vi.setConfig({ testTimeout: 30000 });

const CURL_GATEWAY = ["curl", "-s", "-w", " HTTP_CODE:%{http_code}", "https://demo-8080.uds.dev"];
const ENVOY_DEFAULT_GATEWAY_NAME = "envoy-default-gateway";
const ENVOY_OWNING_GATEWAY_LABEL = "gateway.envoyproxy.io/owning-gateway-name";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);
const core = kc.makeApiClient(k8s.CoreV1Api);
const networking = kc.makeApiClient(k8s.NetworkingV1Api);

type GatewayObject = k8s.KubernetesObject & {
  spec?: {
    listeners?: {
      name?: string;
      protocol?: string;
      port?: number;
    }[];
  };
};

type UDPRouteObject = k8s.KubernetesObject & {
  spec?: {
    parentRefs?: {
      name?: string;
      namespace?: string;
      sectionName?: string;
    }[];
  };
};

// Polls until `extract` returns a value from the default Gateway's managed UDP Service.
async function pollDefaultEnvoyUDPService<T>(
  port: number,
  extract: (service: k8s.V1Service) => T | undefined,
  description: string,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const services = await core.listServiceForAllNamespaces({
      labelSelector: `${ENVOY_OWNING_GATEWAY_LABEL}=${ENVOY_DEFAULT_GATEWAY_NAME}`,
    });
    const service = services.items.find(item =>
      item.spec?.ports?.some(
        servicePort => servicePort.port === port && servicePort.protocol === "UDP",
      ),
    );

    if (service) {
      const value = extract(service);
      if (value !== undefined) {
        return value;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error(`Timeout waiting for ${description} on default Envoy Service port ${port}`);
}

function getDefaultEnvoyUDPServiceTarget(port: number): Promise<string> {
  return pollDefaultEnvoyUDPService(
    port,
    service => {
      const name = service.metadata?.name;
      const namespace = service.metadata?.namespace;
      return name && namespace ? `${name}.${namespace}.svc.cluster.local` : undefined;
    },
    "cluster-local Service DNS name",
    120000,
  );
}

function getDefaultEnvoyExternalAddress(port: number, timeoutMs = 300000): Promise<string> {
  return pollDefaultEnvoyUDPService(
    port,
    service => {
      const ingress = service.status?.loadBalancer?.ingress?.[0];
      return ingress?.ip ?? ingress?.hostname;
    },
    "LoadBalancer external address",
    timeoutMs,
  );
}

async function assertDefaultEnvoyUDPResources(port: number): Promise<string> {
  const gateway = (await customObjects.getNamespacedCustomObject({
    group: "gateway.networking.k8s.io",
    version: "v1",
    namespace: "envoy-default-gateway",
    plural: "gateways",
    name: ENVOY_DEFAULT_GATEWAY_NAME,
  })) as GatewayObject;

  expect(gateway.spec?.listeners).toContainEqual(
    expect.objectContaining({ name: `udp-${port}`, protocol: "UDP", port }),
  );

  const route = (await customObjects.getNamespacedCustomObject({
    group: "gateway.networking.k8s.io",
    version: "v1alpha2",
    namespace: "curl-ns-udp-server",
    plural: "udproutes",
    name: "curl-pkg-udp-server-udp-envoy-gateway-e2e",
  })) as UDPRouteObject;

  expect(route.spec?.parentRefs).toContainEqual(
    expect.objectContaining({
      name: ENVOY_DEFAULT_GATEWAY_NAME,
      namespace: "envoy-default-gateway",
      sectionName: `udp-${port}`,
    }),
  );

  const policies = await networking.listNamespacedNetworkPolicy({
    namespace: "curl-ns-udp-server",
    labelSelector: "uds/package=curl-pkg-udp-server",
  });
  expect(policies.items.length).toBeGreaterThan(0);
  expect(
    policies.items.some(policy =>
      policy.spec?.ingress?.some(rule =>
        rule.ports?.some(policyPort => policyPort.protocol === "UDP" && policyPort.port === port),
      ),
    ),
  ).toBe(true);

  return getDefaultEnvoyUDPServiceTarget(port);
}

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

async function clearUdpLog(serverPodName: string): Promise<void> {
  await execInPod("curl-ns-udp-server", serverPodName, "udp-echo-server", [
    "sh",
    "-c",
    // busybox nc's UDP listener locks onto whichever peer sends the first datagram for
    // its entire process lifetime, ignoring any other peer thereafter. Killing it forces
    // the server's respawn loop to bind a fresh listener so each test gets its own peer,
    // instead of silently losing to whichever earlier test (or client pod) contacted it first.
    "> /tmp/udp.log; pkill -f 'nc -u -l -p 5000' || true; sleep 0.2",
  ]);
}

async function readUdpLog(serverPodName: string): Promise<string> {
  const result = await execInPod("curl-ns-udp-server", serverPodName, "udp-echo-server", [
    "sh",
    "-c",
    "cat /tmp/udp.log 2>/dev/null || true",
  ]);

  return result.stdout.trim();
}

async function waitForUdpLog(
  serverPodName: string,
  expected: string,
  timeoutMs = 5000,
  intervalMs = 250,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = await readUdpLog(serverPodName);
    if (log === expected) return log;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return readUdpLog(serverPodName);
}

function expectUdpPingLog(log: string, message: string) {
  const lines = log.trim().split("\n").filter(Boolean);

  expect(lines.length > 0, `${message} lines=${JSON.stringify(lines)}`).toBe(true);
  expect(
    lines.every(line => line === "ping"),
    `${message} lines=${JSON.stringify(lines)}`,
  ).toBe(true);
}

// Check if egress tests should run
const runEgressTests = process.env.EGRESS_TESTS === "true";
const runUDPExposeTests = process.env.UDP_EXPOSE_TESTS === "true";

// Sends messages from a single socket and collects echo responses. Single socket
// is required because busybox nc's UDP listener latches onto the first peer.
function sendUdpFromHost(
  host: string,
  port: number,
  messages: string[],
  expectEcho = false,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const echoes: string[] = [];
    let sendRemaining = messages.length;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    socket.on("error", err => {
      if (timeout) clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    if (expectEcho) {
      socket.on("message", msg => {
        echoes.push(msg.toString().trim());
        if (echoes.length >= messages.length) {
          if (timeout) clearTimeout(timeout);
          socket.close();
          resolve(echoes);
        }
      });
      timeout = setTimeout(() => {
        socket.close();
        resolve(echoes);
      }, 10000);
    }

    for (const message of messages) {
      socket.send(message, port, host, err => {
        if (err) {
          if (timeout) clearTimeout(timeout);
          socket.close();
          reject(err);
          return;
        }
        sendRemaining -= 1;
        if (sendRemaining === 0 && !expectEcho) {
          socket.close();
          resolve(echoes);
        }
      });
    }
  });
}

let curlPodName1 = "";
let testAdminApp = "";
let curlPodName6 = "";
let curlPodName8 = "";
let curlPodNameEgressAmbient1 = "";
let curlPodNameEgressAmbient2 = "";
let curlPodNameEgressAmbient3 = "";
let curlPodNameEgress1 = "";
let curlPodNameEgress2 = "";
let udpServerPodName = "";
let udpClientPodName = "";

// Each getPodName is a separate API list call; on a slow EKS API server, 9+ sequential
// calls can overrun the default 10s hook timeout. Run them in parallel so total time
// tracks the slowest single call, not the sum.
beforeAll(async () => {
  [
    curlPodName1,
    testAdminApp,
    curlPodName6,
    curlPodName8,
    curlPodNameEgressAmbient1,
    curlPodNameEgressAmbient2,
    curlPodNameEgressAmbient3,
    udpServerPodName,
    udpClientPodName,
  ] = await Promise.all([
    getPodName("curl-ns-deny-all-1", "app=curl-pkg-deny-all-1"),
    getPodName("test-admin-app", "app=httpbin"),
    getPodName("curl-ns-remote-ns-1", "app=curl-pkg-remote-ns-egress"),
    getPodName("curl-ns-kube-api", "app=curl-pkg-kube-api"),
    getPodName("egress-ambient-1", "app=curl"),
    getPodName("egress-ambient-2", "app=curl"),
    getPodName("egress-ambient-2", "app=another-curl"),
    getPodName("curl-ns-udp-server", "app=udp-echo-server"),
    getPodName("curl-ns-udp-allow", "app=udp-echo-client"),
  ]);

  if (runEgressTests) {
    [curlPodNameEgress1, curlPodNameEgress2] = await Promise.all([
      getPodName("egress-gw-1", "app=curl"),
      getPodName("egress-gw-2", "app=curl"),
    ]);
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
      `curl -s -w " HTTP_CODE:%{http_code}" http://www.bing.com`,
    ];

    const egress_ambient_tls_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" https://www.bing.com`,
    ];

    // Validate successful tls request when using Egress for egress-ambient-1
    const success_response_tls = await execInPod(
      "egress-ambient-1",
      curlPodNameEgressAmbient1,
      "curl",
      egress_ambient_tls_curl,
    );

    const tlsDebugMessage = `TLS bing.com curl failed: stdout=${success_response_tls.stdout}, stderr=${success_response_tls.stderr}`;

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
      const EXAMPLE_TLS = ["sh", "-c", `curl -s -w " HTTP_CODE:%{http_code}" https://www.bing.com`];

      // Source: test-admin-app (Anywhere via app-admin-package, now ambient)
      // Target: www.bing.com defined as remoteHost in egress-ambient-1
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
      `curl -s -w " HTTP_CODE:%{http_code}" https://www.bing.com`,
    ];

    const resp = await execInPod(
      "egress-ambient-2",
      curlPodNameEgressAmbient2,
      "curl",
      EXAMPLE_TLS_DENIED,
    );
    const msg = `Egress Ambient per-host isolation (bing.com denied for egress-ambient-2 SA): stdout=${resp.stdout}, stderr=${resp.stderr}`;
    expect(isResponseError(resp), msg).toBe(true);
  });

  test.concurrent(
    "Egress Ambient HTTP to github denied for SA with Google TLS access",
    async () => {
      const EXAMPLE_HTTP_DENIED = [
        "sh",
        "-c",
        `curl -s -w " HTTP_CODE:%{http_code}" http://www.bing.com`,
      ];

      const resp = await execInPod(
        "egress-ambient-2",
        curlPodNameEgressAmbient2,
        "curl",
        EXAMPLE_HTTP_DENIED,
      );
      const msg = `Egress Ambient HTTP bing.com denied for egress-ambient-2 SA: stdout=${resp.stdout}, stderr=${resp.stderr}`;
      expect(isResponseError(resp), msg).toBe(true);
    },
  );

  (runEgressTests ? test.concurrent : test.concurrent.skip)("Egress Gateway", async () => {
    const egress_gateway_http_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" http://bing.com`,
    ];

    const egress_gateway_tls_curl = [
      "sh",
      "-c",
      `curl -s -w " HTTP_CODE:%{http_code}" https://bing.com`,
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

test(
  "UDP NetworkPolicy - DNS allowed, TCP DNS blocked",
  { concurrent: true, retry: 2 },
  async () => {
    // CoreDNS is the only in-cluster UDP service available without additional test resources.
    // allowEgressDNS uses remoteProtocol: UDP on port 53. These tests verify:
    // 1. UDP port 53 is allowed (DNS queries resolve), proving UDP NetworkPolicies are enforced.
    // 2. TCP port 53 is blocked (only UDP 53 is permitted by allowEgressDNS), proving the
    //    policy is protocol-specific and not a blanket port-53 allow.
    const nslookupCommand = [
      "sh",
      "-c",
      "nslookup kubernetes.default.svc.cluster.local > /dev/null 2>&1 && echo OK || echo FAIL",
    ];

    const udpDnsResult = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      nslookupCommand,
    );
    const udpDnsDebug = `UDP DNS (nslookup): stdout=${udpDnsResult.stdout}, stderr=${udpDnsResult.stderr}`;
    expect(udpDnsResult.stdout.trim(), udpDnsDebug).toBe("OK");

    // curl --connect-only establishes a raw TCP connection and exits 0 on success, non-zero on
    // timeout or refusal. Unlike `telnet://`, it does not enter a protocol negotiation loop that
    // always exits non-zero regardless of connectivity.
    const tcpDnsCommand = [
      "sh",
      "-c",
      "curl --max-time 3 --connect-only http://kube-dns.kube-system.svc.cluster.local:53/ 2>&1; echo EXIT:$?",
    ];

    const tcpDnsResult = await execInPod(
      "curl-ns-deny-all-1",
      curlPodName1,
      "curl-pkg-deny-all-1",
      tcpDnsCommand,
    );
    const tcpDnsDebug = `TCP DNS (blocked): stdout=${tcpDnsResult.stdout}, stderr=${tcpDnsResult.stderr}`;
    expect(tcpDnsResult.stdout, tcpDnsDebug).toMatch(/EXIT:[1-9]\d*$/);
  },
);

test("UDP NetworkPolicy - custom allow and deny", { retry: 2, timeout: 60000 }, async () => {
  const serverPod = await K8s(kind.Pod).InNamespace("curl-ns-udp-server").Get(udpServerPodName);
  const serverPodIP = serverPod.status?.podIP ?? "";
  const serverNode = serverPod.spec?.nodeName ?? "";

  const clientPod = await K8s(kind.Pod).InNamespace("curl-ns-udp-allow").Get(udpClientPodName);
  const clientNode = clientPod.spec?.nodeName ?? "";

  const placement = `server-node="${serverNode}" client-node="${clientNode}" server-ip="${serverPodIP}"`;

  // Validate the NetworkPolicy behavior via direct pod IP so the test stays focused on UDP
  // policy enforcement rather than kube-proxy ClusterIP DNAT timing on EKS.
  await clearUdpLog(udpServerPodName);
  const allowedSend = await execInPod("curl-ns-udp-allow", udpClientPodName, "udp-echo-client", [
    "sh",
    "-c",
    // Send all datagrams from a single nc client process (one source port): busybox nc's
    // UDP listener latches onto whichever peer sends the first datagram and ignores any
    // others, so packets sent from separate client processes would be silently dropped.
    `(for i in 1 2 3; do echo ping; sleep 0.2; done) | nc -u -w 1 ${serverPodIP} 5000 2>&1; echo nc-exit:$?`,
  ]);
  const allowedLog = await waitForUdpLog(udpServerPodName, "ping", 5000, 250);
  expectUdpPingLog(
    allowedLog,
    `UDP allowed: log="${allowedLog}" nc="${allowedSend.stdout}" ${placement}`,
  );

  // Blocked: the client's egress NetworkPolicy (curl-pkg-deny-all-1 has no UDP egress to
  // port 5000) is the first enforcement point; the server's ingress NetworkPolicy
  // (curl-pkg-udp-server only permits ingress from curl-ns-udp-allow) provides defense-in-depth.
  // Either policy alone would block the traffic.
  await clearUdpLog(udpServerPodName);
  const deniedSend = await execInPod("curl-ns-deny-all-1", curlPodName1, "curl-pkg-deny-all-1", [
    "sh",
    "-c",
    `(for i in 1 2 3; do echo ping; sleep 0.2; done) | nc -u -w 1 ${serverPodIP} 5000 2>&1; echo nc-exit:$?`,
  ]);
  const deniedLog = await waitForUdpLog(udpServerPodName, "ping", 2000, 250);
  expect(deniedLog, `UDP blocked: log="${deniedLog}" nc="${deniedSend.stdout}" ${placement}`).toBe(
    "",
  );
});

(runUDPExposeTests ? test : test.skip)(
  "UDP expose routes through default Envoy Gateway",
  { retry: 2, timeout: 180000 },
  async () => {
    const serviceTarget = await assertDefaultEnvoyUDPResources(5000);

    await clearUdpLog(udpServerPodName);
    const send = await execInPod("curl-ns-udp-allow", udpClientPodName, "udp-echo-client", [
      "sh",
      "-c",
      `(for i in 1 2 3 4 5; do echo ping; sleep 0.2; done) | nc -u -w 1 ${serviceTarget} 5000 2>&1`,
    ]);
    const receivedLog = await waitForUdpLog(udpServerPodName, "ping", 30000, 1000);

    expectUdpPingLog(
      receivedLog,
      `UDP Envoy Gateway expose: log="${receivedLog}" nc="${send.stdout}" target="${serviceTarget}"`,
    );
  },
);

(runUDPExposeTests ? test : test.skip)(
  "UDP expose reaches the backend through the real external LoadBalancer path",
  { retry: 2, timeout: 300000 },
  async () => {
    await assertDefaultEnvoyUDPResources(5000);
    await clearUdpLog(udpServerPodName);

    const host = await getDefaultEnvoyExternalAddress(5000);
    const port = 5000;

    // Sent directly from this test process (not execInPod), exercising the full
    // external path: LoadBalancer -> Envoy Gateway -> backend -> echo response.
    const echoes = await sendUdpFromHost(host, port, ["ping"], true);

    expect(echoes.length, `No echo received from ${host}:${port}`).toBeGreaterThan(0);
    expect(echoes[0]).toBe("ping");
  },
);

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
