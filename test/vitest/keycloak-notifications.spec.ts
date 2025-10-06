/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import * as crypto from "crypto";
import { afterAll, beforeAll, describe, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";
import { checkAlertInAlertmanager } from "./helpers/alertmanager";

let alertmanagerProxy: { server: net.Server; url: string };
let prometheusProxy: { server: net.Server; url: string };
let keycloakProxy: { server: net.Server; url: string };

describe("integration - Keycloak Notifications", () => {
  beforeAll(async () => {
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
    keycloakProxy = await getForward("keycloak-http", "keycloak", 8080);
  });

  afterAll(async () => {
    await closeForward(alertmanagerProxy.server);
    await closeForward(prometheusProxy.server);
    await closeForward(keycloakProxy.server);
  });

  test("Keycloak Alerts should fire on Realm Modifications", async () => {
    // At first, we need to trigger some Realm and User modification events.
    const accessToken = await getAdminToken(keycloakProxy.url);
    await createRandomClient(keycloakProxy.url, accessToken, "uds");
    await createRandomUserAndJoinGroup(keycloakProxy.url, accessToken, "/UDS Core/Admin", "uds");

    // Next, we wait until the alerts fire
    await expectAlertFires(alertmanagerProxy.url, "KeycloakRealmModificationsDetected");
    await expectAlertFires(alertmanagerProxy.url, "KeycloakUserModificationsDetected");
    await expectAlertFires(alertmanagerProxy.url, "KeycloakSystemAdminModificationsDetected");
  }, 80000);
});

// Small helper to simplify alert checks in Alertmanager
async function expectAlertFires(
  alertmanagerUrl: string,
  alertName: string,
  timeoutMs = 60000,
): Promise<void> {
  await pollUntilSuccess(
    () => checkAlertInAlertmanager(alertmanagerUrl, alertName),
    isAlertFiring => isAlertFiring === true,
    `Checking for ${alertName} alert in AlertManager`,
    timeoutMs,
  );
}

// Helper functions extracted for clarity and reuse
async function getAdminToken(baseUrl: string): Promise<string> {
  const k8s = await import("@kubernetes/client-node");
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const core = kc.makeApiClient(k8s.CoreV1Api);

  const secret = await core.readNamespacedSecret({
    name: "keycloak-admin-password",
    namespace: "keycloak",
  });

  if (!secret.data) {
    throw new Error("keycloak-admin-password secret has no data");
  }

  const b64 = (v?: string) => (v ? Buffer.from(v, "base64").toString("utf8") : undefined);
  const adminUsername = b64(secret.data["username"]);
  const adminPassword = b64(secret.data["password"]);

  if (!adminUsername || !adminPassword) {
    throw new Error("Missing username or password keys in keycloak-admin-password secret");
  }

  const tokenUrl = `${baseUrl}/realms/master/protocol/openid-connect/token`;
  const tokenResp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: adminUsername,
      password: adminPassword,
    }),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new Error(`Failed to get Keycloak token: ${tokenResp.status} ${text}`);
  }

  const tokenJson = (await tokenResp.json()) as { access_token: string };
  return tokenJson.access_token;
}

async function createRandomClient(
  baseUrl: string,
  accessToken: string,
  realm = "uds",
): Promise<string> {
  const randomClientId = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
  const resp = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/clients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId: randomClientId,
      enabled: true,
      protocol: "openid-connect",
      publicClient: true,
      redirectUris: ["*"],
    }),
  });

  if (!(resp.status === 201 || resp.status === 409)) {
    const text = await resp.text();
    throw new Error(`Failed to create client: ${resp.status} ${text}`);
  }

  return randomClientId;
}

async function createRandomUserAndJoinGroup(
  baseUrl: string,
  accessToken: string,
  groupPath = "/UDS Core/Admin",
  realm = "uds",
): Promise<{ userId: string; username: string; groupId: string }> {
  const headersAuth = { Authorization: `Bearer ${accessToken}` } as const;
  const headersJson = { ...headersAuth, "Content-Type": "application/json" } as const;

  // Create user
  const randomUsername = `keycloak-notifications-test-${crypto.randomBytes(6).toString("base64url")}`;
  const createUserResp = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users`, {
    method: "POST",
    headers: headersJson,
    body: JSON.stringify({ username: randomUsername, enabled: true }),
  });

  if (!(createUserResp.status === 201 || createUserResp.status === 409)) {
    const text = await createUserResp.text();
    throw new Error(`Failed to create user: ${createUserResp.status} ${text}`);
  }

  // Resolve userId
  let userId: string | undefined;
  const loc = createUserResp.headers.get("location");
  if (loc) {
    userId = loc.split("/").pop() ?? undefined;
  }
  if (!userId) {
    const usersQuery = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(randomUsername)}&exact=true`,
      { headers: headersAuth },
    );
    if (!usersQuery.ok) {
      const text = await usersQuery.text();
      throw new Error(`Failed to lookup user: ${usersQuery.status} ${text}`);
    }
    const users = (await usersQuery.json()) as Array<{ id: string; username: string }>;
    userId = users.find(u => u.username === randomUsername)?.id;
  }

  if (!userId) {
    throw new Error("Unable to resolve created user ID");
  }

  // Resolve group
  const groupResp = await fetch(
    `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/group-by-path/${encodeURIComponent(groupPath)}`,
    { headers: headersAuth },
  );

  if (!groupResp.ok) {
    const text = await groupResp.text();
    throw new Error(`Failed to resolve group by path: ${groupResp.status} ${text}`);
  }

  const group = (await groupResp.json()) as { id: string };
  if (!group?.id) {
    throw new Error(`Group not found for path ${groupPath}`);
  }

  // Add membership
  const addGroupResp = await fetch(
    `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(group.id)}`,
    { method: "PUT", headers: headersAuth },
  );

  if (!(addGroupResp.status === 204 || addGroupResp.status === 201)) {
    const text = await addGroupResp.text();
    throw new Error(`Failed to add user to group: ${addGroupResp.status} ${text}`);
  }

  return { userId, username: randomUsername, groupId: group.id };
}
