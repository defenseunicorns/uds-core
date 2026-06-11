/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import * as net from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { execInPod, waitForPodReady } from "./helpers/k8s";
import { getAdminToken } from "./helpers/keycloak";
import { pollUntilSuccess } from "./helpers/polling";
import { Direction, UDSPackage } from "../../src/pepr/operator/crd";

vi.setConfig({ hookTimeout: 180000, testTimeout: 180000 });

const TEST_NAMESPACE = "uds-fleet-command";
const TEST_SERVICE_ACCOUNT = "uds-fleet-command-sa";
const TEST_PACKAGE = "fleet-admin-vitest";
const TEST_POD = "fleet-admin-vitest";
const TEST_CONTAINER = "fleet-admin-test";
const CURL_IMAGE = "curlimages/curl";
const TEST_POD_SELECTOR = {
  "app.kubernetes.io/name": TEST_POD,
  "app.kubernetes.io/component": "keycloak-admin-client",
  "app.kubernetes.io/part-of": "fleet-admin-vitest",
};
const KEYCLOAK_INTERNAL_URL = "http://keycloak-http.keycloak.svc.cluster.local:8080";
const KEYCLOAK_REALM = "uds";
const KEYCLOAK_REALM_ISSUER = "http://keycloak-http.keycloak.svc.cluster.local/realms/uds";
const TOKEN_PATH = "/var/run/secrets/fleet/token";
const ACCESS_TOKEN_PATH = "/tmp/fleet-keycloak-access-token";
const CLIENT_SUFFIX = Math.random().toString(36).slice(2, 10);
const FLEET_CREATE_CLIENT_ID = `fleet-vitest-create-${CLIENT_SUFFIX}`;
const FLEET_DELETE_CLIENT_ID = `fleet-vitest-delete-${CLIENT_SUFFIX}`;
const FLEET_RENAME_CLIENT_ID = `fleet-vitest-rename-${CLIENT_SUFFIX}`;
const NON_FLEET_CLIENT_ID = `vitest-${CLIENT_SUFFIX}`;
const TEST_CLIENT_IDS = [
  FLEET_CREATE_CLIENT_ID,
  FLEET_DELETE_CLIENT_ID,
  FLEET_RENAME_CLIENT_ID,
  NON_FLEET_CLIENT_ID,
];

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const core = kc.makeApiClient(k8s.CoreV1Api);

let keycloakProxy: { server: net.Server; url: string } | undefined;
let fleetAccessTokenReady = false;

interface TokenExchangeResult {
  status: number;
  tokenPresent: boolean;
  errorBody?: string;
}

interface PodHttpResponse {
  status: number;
  body: string;
}

interface KeycloakClient {
  id?: string;
  clientId?: string;
  enabled?: boolean;
  protocol?: string;
  publicClient?: boolean;
  redirectUris?: string[];
}

async function waitForPackageReady(namespace: string, name: string): Promise<void> {
  await pollUntilSuccess(
    () => K8s(UDSPackage).InNamespace(namespace).Get(name),
    pkg =>
      pkg.status?.conditions?.some(
        condition => condition.type === "Ready" && condition.status === "True",
      ) ?? false,
    `UDS Package ${namespace}/${name} Ready`,
    120000,
    5000,
  );
}

function parseKeyValueOutput(stdout: string): Record<string, string> {
  return Object.fromEntries(
    stdout
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function expectRejectedResponse(response: PodHttpResponse, label: string): void {
  expect(Number.isNaN(response.status), `${label} did not return a numeric HTTP status`).toBe(
    false,
  );
  expect(
    response.status,
    `${label} should be rejected: body=${truncateForAssertion(response.body)}`,
  ).toBeGreaterThanOrEqual(400);
}

function keycloakPath(path: string): string {
  return `${KEYCLOAK_INTERNAL_URL}${path}`;
}

function truncateForAssertion(value: string | undefined): string {
  if (!value) return "";
  return value.length > 1000 ? `${value.slice(0, 1000)}...<truncated>` : value;
}

async function ensureFleetAccessToken(): Promise<void> {
  if (fleetAccessTokenReady) {
    return;
  }

  const tokenExchange = await exchangeFleetTokenFromPod();
  expect(
    tokenExchange.status,
    `Keycloak token exchange failed for audience ${KEYCLOAK_REALM_ISSUER}: body=${truncateForAssertion(tokenExchange.errorBody)}`,
  ).toBe(200);
  expect(
    tokenExchange.tokenPresent,
    `Keycloak token exchange returned 200 but no access token was parsed`,
  ).toBe(true);

  fleetAccessTokenReady = true;
}

async function exchangeFleetTokenFromPod(): Promise<TokenExchangeResult> {
  const result = await execInPod(TEST_NAMESPACE, TEST_POD, TEST_CONTAINER, [
    "sh",
    "-c",
    `
set -eu
token_response="$(mktemp)"
trap 'rm -f "$token_response"' EXIT

token_status="$(curl -sS -o "$token_response" -w "%{http_code}" -X POST "${keycloakPath(`/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`)}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  --data-urlencode "client_assertion@${TOKEN_PATH}")"
access_token="$(tr -d '\\n' < "$token_response" | sed 's/.*"access_token"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/')"

echo "token_status=$token_status"
if [ "$access_token" = "$(cat "$token_response")" ] || [ -z "$access_token" ]; then
  rm -f "${ACCESS_TOKEN_PATH}"
  echo "token_present=false"
  if [ "$token_status" != "200" ]; then
    printf 'token_error_body=%s\\n' "$(tr '\\n' ' ' < "$token_response")"
  fi
  exit 0
fi

printf '%s' "$access_token" > "${ACCESS_TOKEN_PATH}"
chmod 600 "${ACCESS_TOKEN_PATH}"
echo "token_present=true"
`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Fleet token exchange command failed: stderr=${result.stderr}`);
  }

  const output = parseKeyValueOutput(result.stdout);
  return {
    status: Number(output.token_status),
    tokenPresent: output.token_present === "true",
    errorBody: output.token_error_body,
  };
}

async function keycloakPodRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<PodHttpResponse> {
  const command = [
    "sh",
    "-c",
    `
set -eu
method="$1"
url="$2"
body="$3"
response_body="$(mktemp)"
request_body="$(mktemp)"
trap 'rm -f "$response_body" "$request_body"' EXIT

if [ -n "$body" ]; then
  printf '%s' "$body" > "$request_body"
  status="$(curl -sS -o "$response_body" -w "%{http_code}" -X "$method" "$url" \
    -H "Authorization: Bearer $(cat "${ACCESS_TOKEN_PATH}")" \
    -H "Content-Type: application/json" \
    --data-binary "@$request_body")"
else
  status="$(curl -sS -o "$response_body" -w "%{http_code}" -X "$method" "$url" \
    -H "Authorization: Bearer $(cat "${ACCESS_TOKEN_PATH}")")"
fi

printf 'status=%s\\n' "$status"
cat "$response_body"
`,
    "keycloak-request",
    method,
    keycloakPath(path),
    body === undefined ? "" : JSON.stringify(body),
  ];

  const result = await execInPod(TEST_NAMESPACE, TEST_POD, TEST_CONTAINER, command);
  if (result.exitCode !== 0) {
    throw new Error(
      `Keycloak pod request failed: method=${method} path=${path} stderr=${result.stderr}`,
    );
  }

  const [statusLine = "", ...bodyLines] = result.stdout.split("\n");
  return {
    status: Number(statusLine.replace("status=", "")),
    body: bodyLines.join("\n").trim(),
  };
}

function parseJsonBody<T>(response: PodHttpResponse): T {
  return JSON.parse(response.body) as T;
}

function fleetClientBody(clientId: string): KeycloakClient {
  return {
    clientId,
    enabled: true,
    protocol: "openid-connect",
    publicClient: true,
    redirectUris: [`https://${clientId}.uds.dev/callback`],
  };
}

async function getClientByClientId(clientId: string): Promise<KeycloakClient | undefined> {
  const lookup = await keycloakPodRequest(
    "GET",
    `/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${encodeURIComponent(clientId)}`,
  );
  expect(
    lookup.status,
    `client lookup failed for ${clientId}: body=${truncateForAssertion(lookup.body)}`,
  ).toBe(200);

  const clients = parseJsonBody<KeycloakClient[]>(lookup);
  return clients.find(client => client.clientId === clientId);
}

async function expectClientExists(clientId: string): Promise<KeycloakClient & { id: string }> {
  const client = await getClientByClientId(clientId);
  expect(client?.id, `expected Keycloak client ${clientId} to exist`).toEqual(expect.any(String));
  expect(client?.clientId).toBe(clientId);
  return client as KeycloakClient & { id: string };
}

async function expectClientMissing(clientId: string): Promise<void> {
  const client = await getClientByClientId(clientId);
  expect(client, `expected Keycloak client ${clientId} to be absent`).toBeUndefined();
}

async function createFleetClient(clientId: string): Promise<KeycloakClient & { id: string }> {
  const createFleet = await keycloakPodRequest(
    "POST",
    `/admin/realms/${KEYCLOAK_REALM}/clients`,
    fleetClientBody(clientId),
  );
  expect(
    createFleet.status,
    `fleet client creation failed for ${clientId}: body=${truncateForAssertion(createFleet.body)}`,
  ).toBe(201);

  const client = await expectClientExists(clientId);
  expect(client.enabled).toBe(true);
  expect(client.protocol).toBe("openid-connect");
  expect(client.publicClient).toBe(true);
  expect(client.redirectUris).toContain(`https://${clientId}.uds.dev/callback`);
  return client;
}

async function deleteClientByClientId(clientId: string): Promise<void> {
  if (!keycloakProxy) {
    keycloakProxy = await getForward("keycloak-http", "keycloak", 8080);
  }

  const adminToken = await getAdminToken(keycloakProxy.url);
  const lookup = await fetch(
    `${keycloakProxy.url}/admin/realms/${encodeURIComponent(KEYCLOAK_REALM)}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );

  if (!lookup.ok) {
    return;
  }

  const clients = (await lookup.json()) as Array<{ id?: string; clientId?: string }>;
  const client = clients.find(candidate => candidate.clientId === clientId);
  if (!client?.id) {
    return;
  }

  await fetch(
    `${keycloakProxy.url}/admin/realms/${encodeURIComponent(KEYCLOAK_REALM)}/clients/${encodeURIComponent(client.id)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  );
}

async function cleanupTestClients(): Promise<void> {
  for (const clientId of TEST_CLIENT_IDS) {
    await deleteClientByClientId(clientId).catch(() => undefined);
  }
}

async function cleanupTestResources(): Promise<void> {
  await cleanupTestClients();
  await K8s(UDSPackage)
    .InNamespace(TEST_NAMESPACE)
    .Delete(TEST_PACKAGE)
    .catch(() => undefined);
  await core
    .deleteNamespacedPod({ namespace: TEST_NAMESPACE, name: TEST_POD })
    .catch(() => undefined);
  await core
    .deleteNamespacedServiceAccount({ namespace: TEST_NAMESPACE, name: TEST_SERVICE_ACCOUNT })
    .catch(() => undefined);
  await K8s(kind.Namespace)
    .Delete(TEST_NAMESPACE)
    .catch(() => undefined);

  if (keycloakProxy) {
    await closeForward(keycloakProxy.server).catch(() => undefined);
    keycloakProxy = undefined;
  }
}

describe("integration - Fleet Keycloak admin client", () => {
  beforeAll(async () => {
    await cleanupTestClients();

    await K8s(kind.Namespace).Apply({
      metadata: {
        name: TEST_NAMESPACE,
        labels: {
          "zarf.dev/agent": "ignore",
        },
      },
    });

    await core
      .deleteNamespacedPod({ namespace: TEST_NAMESPACE, name: TEST_POD })
      .catch(() => undefined);

    await K8s(kind.ServiceAccount).Apply({
      metadata: {
        name: TEST_SERVICE_ACCOUNT,
        namespace: TEST_NAMESPACE,
      },
    });

    await K8s(UDSPackage).Apply({
      metadata: {
        name: TEST_PACKAGE,
        namespace: TEST_NAMESPACE,
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              selector: TEST_POD_SELECTOR,
              remoteNamespace: "keycloak",
              remoteSelector: {
                "app.kubernetes.io/name": "keycloak",
              },
              port: 8080,
            },
          ],
          expose: [],
        },
      },
    });

    await waitForPackageReady(TEST_NAMESPACE, TEST_PACKAGE);

    await core.createNamespacedPod({
      namespace: TEST_NAMESPACE,
      body: {
        metadata: {
          name: TEST_POD,
          namespace: TEST_NAMESPACE,
          labels: TEST_POD_SELECTOR,
        },
        spec: {
          serviceAccountName: TEST_SERVICE_ACCOUNT,
          restartPolicy: "Never",
          containers: [
            {
              name: TEST_CONTAINER,
              image: CURL_IMAGE,
              imagePullPolicy: "IfNotPresent",
              command: ["sleep", "3600"],
              volumeMounts: [
                {
                  name: "fleet-token",
                  mountPath: "/var/run/secrets/fleet",
                  readOnly: true,
                },
              ],
              resources: {
                requests: {
                  cpu: "10m",
                  memory: "32Mi",
                },
                limits: {
                  cpu: "100m",
                  memory: "128Mi",
                },
              },
            },
          ],
          volumes: [
            {
              name: "fleet-token",
              projected: {
                sources: [
                  {
                    serviceAccountToken: {
                      path: "token",
                      audience: KEYCLOAK_REALM_ISSUER,
                      expirationSeconds: 3600,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    await waitForPodReady(TEST_NAMESPACE, {
      name: TEST_POD,
      containerName: TEST_CONTAINER,
      timeoutMs: 120000,
    });
  });

  afterAll(async () => {
    await cleanupTestResources();
  });

  it("exchanges the Fleet service-account token for a Keycloak access token", async () => {
    await ensureFleetAccessToken();
  });

  it("can create a fleet-prefixed client and read it back", async () => {
    await ensureFleetAccessToken();

    await createFleetClient(FLEET_CREATE_CLIENT_ID);
  });

  it("can delete a fleet-prefixed client it created", async () => {
    await ensureFleetAccessToken();

    const fleetClient = await createFleetClient(FLEET_DELETE_CLIENT_ID);

    const deleteFleet = await keycloakPodRequest(
      "DELETE",
      `/admin/realms/${KEYCLOAK_REALM}/clients/${encodeURIComponent(fleetClient.id)}`,
    );
    expect(
      deleteFleet.status,
      `fleet client deletion failed for ${FLEET_DELETE_CLIENT_ID}: body=${truncateForAssertion(deleteFleet.body)}`,
    ).toBe(204);

    await expectClientMissing(FLEET_DELETE_CLIENT_ID);
  });

  it("cannot create a non-fleet-prefixed client", async () => {
    await ensureFleetAccessToken();

    const createNonFleet = await keycloakPodRequest(
      "POST",
      `/admin/realms/${KEYCLOAK_REALM}/clients`,
      {
        clientId: NON_FLEET_CLIENT_ID,
        enabled: true,
        protocol: "openid-connect",
        publicClient: true,
      },
    );
    expectRejectedResponse(createNonFleet, "non-fleet client creation");
    await expectClientMissing(NON_FLEET_CLIENT_ID);
  });

  it("cannot rename an owned fleet client outside the fleet prefix", async () => {
    await ensureFleetAccessToken();

    const fleetClient = await createFleetClient(FLEET_RENAME_CLIENT_ID);

    const renameFleet = await keycloakPodRequest(
      "PUT",
      `/admin/realms/${KEYCLOAK_REALM}/clients/${encodeURIComponent(fleetClient.id)}`,
      {
        id: fleetClient.id,
        clientId: NON_FLEET_CLIENT_ID,
        enabled: true,
        protocol: "openid-connect",
        publicClient: true,
      },
    );
    expectRejectedResponse(renameFleet, "fleet client rename outside prefix");

    await expectClientExists(FLEET_RENAME_CLIENT_ID);
    await expectClientMissing(NON_FLEET_CLIENT_ID);
  });

  it("cannot delete a built-in client it does not own", async () => {
    await ensureFleetAccessToken();

    const builtinLookup = await keycloakPodRequest(
      "GET",
      `/admin/realms/${KEYCLOAK_REALM}/clients?clientId=account`,
    );
    expect(builtinLookup.status).toBe(200);
    const [builtinClient] = parseJsonBody<Array<{ id?: string; clientId?: string }>>(builtinLookup);
    expect(builtinClient?.id).toEqual(expect.any(String));

    const deleteBuiltin = await keycloakPodRequest(
      "DELETE",
      `/admin/realms/${KEYCLOAK_REALM}/clients/${encodeURIComponent(builtinClient!.id!)}`,
    );
    expectRejectedResponse(deleteBuiltin, "built-in client deletion");

    const accountClient = await getClientByClientId("account");
    expect(accountClient?.id).toBe(builtinClient!.id);
  });
});
