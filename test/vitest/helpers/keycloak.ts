/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s, kind } from "pepr";

export async function getAdminToken(baseUrl: string): Promise<string> {
  const secret = await K8s(kind.Secret).InNamespace("keycloak").Get("keycloak-admin-password")

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

export async function createRandomClient(
  baseUrl: string,
  accessToken: string,
  clientId: string,
  realm = "uds",
): Promise<string> {
  const resp = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/clients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
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

  return clientId;
}

export async function createRandomUserAndJoinGroup(
  baseUrl: string,
  accessToken: string,
  username: string,
  groupPath: string,
  realm = "uds",
): Promise<{ userId: string; username: string; groupId: string }> {
  const headersAuth = { Authorization: `Bearer ${accessToken}` } as const;
  const headersJson = { ...headersAuth, "Content-Type": "application/json" } as const;

  // Create user
  const createUserResp = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users`, {
    method: "POST",
    headers: headersJson,
    body: JSON.stringify({ username, enabled: true }),
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
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(username)}&exact=true`,
      { headers: headersAuth },
    );
    if (!usersQuery.ok) {
      const text = await usersQuery.text();
      throw new Error(`Failed to lookup user: ${usersQuery.status} ${text}`);
    }
    const users = (await usersQuery.json()) as Array<{ id: string; username: string }>;
    userId = users.find(u => u.username === username)?.id;
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

  return { userId, username, groupId: group.id };
}

