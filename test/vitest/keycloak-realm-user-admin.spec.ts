/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import * as net from "node:net";
import * as k8s from "@kubernetes/client-node";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { createUser, getAdminToken } from "./helpers/keycloak";
import { execInPod, waitForPodReady } from "./helpers/k8s";

const realm = "uds";
const suffix = randomBytes(6).toString("base64url");
const adminUsername = `realm-user-admin-${suffix}`;
const adminPassword = `RealmUserAdmin!#A1${suffix}`;
const adminGroupName = `realm-user-admins-${suffix}`;
const adminPolicyName = `realm-user-admin-policy-${suffix}`;
const adminPermissionName = `realm-user-admin-permission-${suffix}`;
const targetUsername = `realm-user-target-${suffix}`;
const repoRoot = resolve(process.cwd(), "../..");
const provisioningScript = resolve(
  repoRoot,
  "scripts/configure-keycloak-dedicated-admin-console.sh",
);

interface KeycloakClient {
  id: string;
  clientId: string;
}

interface KeycloakRole {
  id: string;
  name: string;
}

interface KeycloakUser {
  id: string;
  username: string;
  attributes?: Record<string, string[]>;
}

interface KeycloakPackage {
  spec?: { network?: { expose?: Array<{ description?: string }> } };
}

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const core = kc.makeApiClient(k8s.CoreV1Api);
const customObjects = kc.makeApiClient(k8s.CustomObjectsApi);

describe("integration - Keycloak realm user administrator", () => {
  let keycloakProxy: { server: net.Server; url: string };
  let masterToken: string;
  let realmAdminId: string;
  let targetUserId: string;
  let adminGroupId: string;
  let realmManagementClientId: string;
  let securityAdminConsoleClientId: string;
  let queryUsersRole: KeycloakRole;
  let realmAdminToken: string;
  let adminPermissionsClientId: string;
  let adminPolicyId: string;
  let adminPermissionId: string;
  let realmRepresentation: Record<string, unknown>;
  let tenantCurlPod: string;
  let tenantConsoleEnabled = false;

  const adminRequest = (path: string, init: RequestInit = {}) =>
    fetch(`${keycloakProxy.url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${masterToken}`, ...init.headers },
    });

  beforeAll(async () => {
    const keycloakPackage = (await customObjects.getNamespacedCustomObject({
      group: "uds.dev",
      version: "v1alpha1",
      namespace: "keycloak",
      plural: "packages",
      name: "keycloak",
    })) as KeycloakPackage;
    tenantConsoleEnabled =
      keycloakPackage.spec?.network?.expose?.some(
        expose => expose.description === "dedicated realm admin console",
      ) ?? false;
    tenantCurlPod =
      (
        await waitForPodReady("test-admin-app", {
          labelSelector: "app=httpbin",
          containerName: "curl",
        })
      ).metadata?.name ?? "";
    expect(tenantCurlPod).toBeTruthy();

    if (!tenantConsoleEnabled) return;

    keycloakProxy = await getForward("keycloak-http", "keycloak", 8080);
    masterToken = await getAdminToken(keycloakProxy.url);

    realmAdminId = (await createUser(keycloakProxy.url, masterToken, adminUsername, realm)).userId;
    targetUserId = (await createUser(keycloakProxy.url, masterToken, targetUsername, realm)).userId;

    const passwordResponse = await adminRequest(
      `/admin/realms/${realm}/users/${realmAdminId}/reset-password`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "password", value: adminPassword, temporary: false }),
      },
    );
    expect(passwordResponse.status).toBe(204);

    const adminSecret = await core.readNamespacedSecret({
      name: "keycloak-admin-password",
      namespace: "keycloak",
    });
    const decodeSecret = (key: string) =>
      Buffer.from(adminSecret.data?.[key] ?? "", "base64").toString("utf8");
    const keycloakAdminUsername = decodeSecret("username");
    const keycloakAdminPassword = decodeSecret("password");
    expect(keycloakAdminUsername).toBeTruthy();
    expect(keycloakAdminPassword).toBeTruthy();
    execFileSync(provisioningScript, {
      cwd: repoRoot,
      env: {
        ...process.env,
        CLUSTER_DOMAIN: "uds.dev",
        KEYCLOAK_ADMIN_PASSWORD: keycloakAdminPassword,
        KEYCLOAK_ADMIN_USERNAME: keycloakAdminUsername,
        KEYCLOAK_URL: keycloakProxy.url,
        KUBECTL_BIN: process.env.KUBECTL_BIN ?? "uds zarf tools kubectl",
        UDS_REALM_ADMIN_USERNAME: adminUsername,
      },
      stdio: "pipe",
    });

    const realmResponse = await adminRequest(`/admin/realms/${realm}`);
    expect(realmResponse.status).toBe(200);
    realmRepresentation = (await realmResponse.json()) as Record<string, unknown>;
    const enablePermissionsResponse = await adminRequest(`/admin/realms/${realm}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...realmRepresentation, adminPermissionsEnabled: true }),
    });
    expect(enablePermissionsResponse.status).toBe(204);

    const createGroupResponse = await adminRequest(`/admin/realms/${realm}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: adminGroupName }),
    });
    expect(createGroupResponse.status).toBe(201);
    const groupsResponse = await adminRequest(
      `/admin/realms/${realm}/groups?search=${adminGroupName}&exact=true`,
    );
    expect(groupsResponse.status).toBe(200);
    adminGroupId = ((await groupsResponse.json()) as Array<{ id: string }>)[0].id;

    const clientsResponse = await adminRequest(
      `/admin/realms/${realm}/clients?clientId=realm-management`,
    );
    expect(clientsResponse.status).toBe(200);
    const [managementClient] = (await clientsResponse.json()) as KeycloakClient[];
    expect(managementClient?.id).toBeTruthy();
    realmManagementClientId = managementClient.id;

    const roleResponse = await adminRequest(
      `/admin/realms/${realm}/clients/${managementClient.id}/roles/query-users`,
    );
    expect(roleResponse.status).toBe(200);
    queryUsersRole = (await roleResponse.json()) as KeycloakRole;

    const consoleClientResponse = await adminRequest(
      `/admin/realms/${realm}/clients?clientId=security-admin-console`,
    );
    expect(consoleClientResponse.status).toBe(200);
    securityAdminConsoleClientId = ((await consoleClientResponse.json()) as KeycloakClient[])[0].id;

    const consoleScopePath = `/admin/realms/${realm}/clients/${securityAdminConsoleClientId}/scope-mappings/clients/${managementClient.id}`;
    const consoleScopeResponse = await adminRequest(consoleScopePath);
    expect(consoleScopeResponse.status).toBe(200);
    const consoleScopeRoles = (await consoleScopeResponse.json()) as KeycloakRole[];
    expect(consoleScopeRoles.some(role => role.name === queryUsersRole.name)).toBe(true);

    const consoleClientDetailResponse = await adminRequest(
      `/admin/realms/${realm}/clients/${securityAdminConsoleClientId}`,
    );
    expect(consoleClientDetailResponse.status).toBe(200);
    const consoleClient = (await consoleClientDetailResponse.json()) as Record<string, unknown>;
    const directGrantsEnabled = consoleClient.directAccessGrantsEnabled === true;
    try {
      if (!directGrantsEnabled) {
        const enableDirectGrantsResponse = await adminRequest(
          `/admin/realms/${realm}/clients/${securityAdminConsoleClientId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...consoleClient, directAccessGrantsEnabled: true }),
          },
        );
        expect(enableDirectGrantsResponse.status).toBe(204);
      }

      const consoleTokenResponse = await execInPod("test-admin-app", tenantCurlPod, "curl", [
        "curl",
        "-sS",
        "--fail-with-body",
        "-m",
        "10",
        "--request",
        "POST",
        "--data-urlencode",
        "grant_type=password",
        "--data-urlencode",
        "client_id=security-admin-console",
        "--data-urlencode",
        `username=${adminUsername}`,
        "--data-urlencode",
        `password=${adminPassword}`,
        `https://keycloak.uds.dev/realms/${realm}/protocol/openid-connect/token`,
      ]);
      expect(consoleTokenResponse.exitCode, consoleTokenResponse.stderr).toBe(0);
      realmAdminToken = (JSON.parse(consoleTokenResponse.stdout) as { access_token: string })
        .access_token;
    } finally {
      if (!directGrantsEnabled) {
        const restoreDirectGrantsResponse = await adminRequest(
          `/admin/realms/${realm}/clients/${securityAdminConsoleClientId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(consoleClient),
          },
        );
        expect(restoreDirectGrantsResponse.status).toBe(204);
      }
    }

    const mappingResponse = await adminRequest(
      `/admin/realms/${realm}/groups/${adminGroupId}/role-mappings/clients/${managementClient.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([queryUsersRole]),
      },
    );
    expect(mappingResponse.status).toBe(204);

    const membershipResponse = await adminRequest(
      `/admin/realms/${realm}/users/${realmAdminId}/groups/${adminGroupId}`,
      { method: "PUT" },
    );
    expect(membershipResponse.status).toBe(204);

    const adminPermissionsClientResponse = await adminRequest(
      `/admin/realms/${realm}/clients?clientId=admin-permissions`,
    );
    expect(adminPermissionsClientResponse.status).toBe(200);
    adminPermissionsClientId = (
      (await adminPermissionsClientResponse.json()) as KeycloakClient[]
    )[0].id;

    const policyResponse = await adminRequest(
      `/admin/realms/${realm}/clients/${adminPermissionsClientId}/authz/resource-server/policy/group`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: adminPolicyName,
          logic: "POSITIVE",
          decisionStrategy: "UNANIMOUS",
          groups: [{ id: adminGroupId, extendChildren: false }],
        }),
      },
    );
    expect(policyResponse.status).toBe(201);
    adminPolicyId = ((await policyResponse.json()) as { id: string }).id;

    const permissionResponse = await adminRequest(
      `/admin/realms/${realm}/clients/${adminPermissionsClientId}/authz/resource-server/permission/scope`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: adminPermissionName,
          logic: "POSITIVE",
          decisionStrategy: "UNANIMOUS",
          resourceType: "Users",
          scopes: ["view", "manage"],
          policies: [adminPolicyName],
        }),
      },
    );
    expect(permissionResponse.status).toBe(201);
    adminPermissionId = ((await permissionResponse.json()) as { id: string }).id;
  }, 60000);

  afterAll(async () => {
    if (masterToken) {
      if (adminPermissionId) {
        await adminRequest(
          `/admin/realms/${realm}/clients/${adminPermissionsClientId}/authz/resource-server/permission/scope/${adminPermissionId}`,
          { method: "DELETE" },
        );
      }
      if (adminPolicyId) {
        await adminRequest(
          `/admin/realms/${realm}/clients/${adminPermissionsClientId}/authz/resource-server/policy/group/${adminPolicyId}`,
          { method: "DELETE" },
        );
      }
      await Promise.all([
        ...[realmAdminId, targetUserId]
          .filter(Boolean)
          .map(userId =>
            adminRequest(`/admin/realms/${realm}/users/${userId}`, { method: "DELETE" }),
          ),
        adminGroupId
          ? adminRequest(`/admin/realms/${realm}/groups/${adminGroupId}`, { method: "DELETE" })
          : Promise.resolve(),
      ]);
      if (realmRepresentation?.adminPermissionsEnabled !== true) {
        await adminRequest(`/admin/realms/${realm}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...realmRepresentation, adminPermissionsEnabled: false }),
        });
      }
    }
    if (keycloakProxy) {
      await closeForward(keycloakProxy.server);
    }
  });

  test("can update user attributes but cannot administer clients", async () => {
    const tenantRequest = (path: string, token = "", method = "GET", body = "") => {
      const args = [
        "curl",
        "-sS",
        "-m",
        "10",
        "-o",
        "-",
        "-w",
        "\nHTTP_CODE:%{http_code}",
        "--request",
        method,
      ];
      if (token) args.push("--header", `Authorization: Bearer ${token}`);
      if (body) args.push("--header", "Content-Type: application/json", "--data-binary", body);
      args.push(`https://keycloak.uds.dev${path}`);
      return execInPod("test-admin-app", tenantCurlPod, "curl", args);
    };
    const status = (stdout: string) => Number(stdout.match(/HTTP_CODE:(\d+)$/)?.[1]);
    const body = (stdout: string) => stdout.replace(/\nHTTP_CODE:\d+$/, "");

    if (!tenantConsoleEnabled) {
      const disabledResponse = await tenantRequest(`/admin/${realm}/console/`);
      expect(status(disabledResponse.stdout)).not.toBe(200);
      return;
    }

    const serverInfoResponse = await tenantRequest("/admin/serverinfo", realmAdminToken);
    expect(status(serverInfoResponse.stdout)).toBe(200);

    const realmResponse = await tenantRequest(`/admin/realms/${realm}`, realmAdminToken);
    expect(status(realmResponse.stdout)).toBe(200);

    const userResponse = await tenantRequest(
      `/admin/realms/${realm}/users/${targetUserId}`,
      realmAdminToken,
    );
    expect(status(userResponse.stdout)).toBe(200);
    const user = JSON.parse(body(userResponse.stdout)) as KeycloakUser;

    const updateResponse = await tenantRequest(
      `/admin/realms/${realm}/users/${targetUserId}`,
      realmAdminToken,
      "PUT",
      JSON.stringify({
        ...user,
        attributes: { ...user.attributes, dedicatedConsoleTest: [suffix] },
      }),
    );
    expect(status(updateResponse.stdout)).toBe(204);

    const updatedUserResponse = await tenantRequest(
      `/admin/realms/${realm}/users/${targetUserId}`,
      realmAdminToken,
    );
    expect(status(updatedUserResponse.stdout)).toBe(200);
    const updatedUser = JSON.parse(body(updatedUserResponse.stdout)) as KeycloakUser;
    expect(updatedUser.attributes?.dedicatedConsoleTest).toEqual([suffix]);

    const clientsResponse = await tenantRequest(`/admin/realms/${realm}/clients`, realmAdminToken);
    expect(status(clientsResponse.stdout)).toBe(403);

    const groupMembershipResponse = await tenantRequest(
      `/admin/realms/${realm}/users/${targetUserId}/groups/${adminGroupId}`,
      realmAdminToken,
      "PUT",
    );
    expect(status(groupMembershipResponse.stdout)).toBe(403);

    const roleMappingResponse = await tenantRequest(
      `/admin/realms/${realm}/users/${targetUserId}/role-mappings/clients/${realmManagementClientId}`,
      realmAdminToken,
      "POST",
      JSON.stringify([queryUsersRole]),
    );
    expect(status(roleMappingResponse.stdout)).toBe(403);

    const masterResponse = await tenantRequest("/admin/realms/master", realmAdminToken);
    expect(status(masterResponse.stdout)).toBe(403);
  }, 60000);
});
