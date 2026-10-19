/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSConfig } from "../../config/config";
import { KeycloakClientMode } from "../../config/types";
import { UDSPackage } from "../../../crd";
import { getPackageClientOwner, PACKAGE_OWNER_UID_ATTRIBUTE } from "../client-owner";
import { Client } from "../types";
import { syncClient } from "../client-sync";

const { mockFetch, mockPackageGet, mockSecretGet, mockSecretNamespace, mockApply } = vi.hoisted(
  () => ({
    mockFetch: vi.fn(),
    mockPackageGet: vi.fn(),
    mockSecretGet: vi.fn(),
    mockSecretNamespace: vi.fn(),
    mockApply: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock("pepr", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
  K8s: () => ({
    Get: (...args: unknown[]) => mockPackageGet(...args),
    Apply: (...args: unknown[]) => mockApply(...args),
    InNamespace: (namespace: string) => {
      mockSecretNamespace(namespace);
      return { Get: (...args: unknown[]) => mockSecretGet(...args) };
    },
  }),
  kind: { Secret: "Secret" },
  Log: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("fs", () => ({ default: { promises: { readFile: vi.fn().mockResolvedValue("token") } } }));

import {
  credentialsCreateOrUpdate,
  credentialsDelete,
  resetCachedToken,
} from "./client-credentials";

UDSConfig.domain = "uds.dev";

interface TestClient extends Partial<Client> {
  id: string;
  clientId: string;
  secret?: string;
}

const clients: TestClient[] = [];
let livePackages: UDSPackage[] = [];
let conflictOnCreate: TestClient | undefined;
let inexactSearchClient: TestClient | undefined;
let inexactSearchFor: string | undefined;
let stripOwnerMarkerAfterPut = false;
let nextId = 0;

function packageFixture({
  uid = "package-uid-a",
  namespace = "app-ns",
  name = "app-package",
  clientId = "my-app",
  includeProbe = false,
  statusClientIds = [] as string[],
}: {
  uid?: string;
  namespace?: string;
  name?: string;
  clientId?: string;
  includeProbe?: boolean;
  statusClientIds?: string[];
} = {}): UDSPackage {
  return {
    metadata: { uid, namespace, name },
    spec: {
      sso: [
        {
          name: "App SSO",
          clientId,
          enableAuthserviceSelector: includeProbe ? { app: "my-app" } : undefined,
          redirectUris: ["https://app.uds.dev/login"],
        },
      ],
      network: includeProbe
        ? {
            expose: [{ host: "app", uptime: { checks: { paths: ["/health"] } } }],
          }
        : {},
    },
    status: statusClientIds.length ? { ssoClients: statusClientIds } : undefined,
  };
}

function ownerOf(pkg: UDSPackage) {
  return getPackageClientOwner(pkg);
}

function clientFixture(
  clientId: string,
  ownerUid?: string,
  overrides: Partial<TestClient> = {},
): TestClient {
  return {
    id: `keycloak-uuid-${clientId}`,
    clientId,
    name: clientId,
    attributes: ownerUid ? { [PACKAGE_OWNER_UID_ATTRIBUTE]: ownerUid } : {},
    secret: `secret-${clientId}`,
    fullScopeAllowed: false,
    serviceAccountsEnabled: false,
    standardFlowEnabled: true,
    ...overrides,
  };
}

function jwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64");
  const payload = Buffer.from(JSON.stringify({ exp, resource_access: {} })).toString("base64");
  return `${header}.${payload}.signature`;
}

function response(status: number, data?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 409 ? "Conflict" : "OK",
    data,
  };
}

function getClientSearchResults(url: URL): TestClient[] {
  const clientId = url.searchParams.get("clientId");
  if (clientId && inexactSearchFor === clientId && inexactSearchClient) {
    return [inexactSearchClient];
  }
  return clientId ? clients.filter(client => client.clientId === clientId) : [...clients];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCachedToken();
  clients.splice(0, clients.length);
  livePackages = [];
  conflictOnCreate = undefined;
  inexactSearchClient = undefined;
  inexactSearchFor = undefined;
  stripOwnerMarkerAfterPut = false;
  nextId = 0;
  UDSConfig.keycloakClientMode = KeycloakClientMode.CLIENT_SECRET;
  mockSecretGet.mockResolvedValue({
    data: { "uds-operator": Buffer.from("operator-secret").toString("base64") },
  });
  mockPackageGet.mockImplementation(async () => ({ items: livePackages, metadata: {} }));
  mockFetch.mockImplementation(async (rawUrl: string, options: RequestInit = {}) => {
    const url = new URL(rawUrl);
    const method = options.method ?? "GET";
    if (url.pathname.endsWith("/protocol/openid-connect/token")) {
      return response(200, { access_token: jwt(9999999999) });
    }
    if (url.pathname === "/admin/realms/uds/clients" && method === "GET") {
      const page = getClientSearchResults(url);
      const first = Number(url.searchParams.get("first") ?? 0);
      const max = Number(url.searchParams.get("max") ?? (page.length || 1));
      return response(
        200,
        page.slice(first, first + max).map(({ id, clientId, attributes }) => ({
          id,
          clientId,
          attributes,
        })),
      );
    }
    if (url.pathname === "/admin/realms/uds/clients" && method === "POST") {
      if (conflictOnCreate) {
        clients.push(conflictOnCreate);
        conflictOnCreate = undefined;
        return response(409, { error: "clientId already exists" });
      }
      const body = JSON.parse(String(options.body)) as Partial<TestClient>;
      if (clients.some(client => client.clientId === body.clientId)) {
        return response(409, { error: "clientId already exists" });
      }
      const created: TestClient = {
        ...body,
        id: `created-${++nextId}`,
        clientId: body.clientId!,
        secret: body.secret ?? `secret-${body.clientId}`,
      };
      clients.push(created);
      return response(201);
    }

    const id = url.pathname.split("/").at(-1);
    const index = clients.findIndex(client => client.id === id);
    if (method === "GET" && index >= 0) {
      return response(200, { ...clients[index] });
    }
    if (method === "PUT" && index >= 0) {
      const body = JSON.parse(String(options.body)) as Partial<TestClient>;
      clients[index] = { ...clients[index], ...body, secret: clients[index].secret };
      if (stripOwnerMarkerAfterPut) {
        delete clients[index].attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE];
      }
      return response(204);
    }
    if (method === "DELETE" && index >= 0) {
      clients.splice(index, 1);
      return response(204);
    }
    return response(404, { error: "Not Found" });
  });
});

describe("Package-owned Keycloak client credentials", () => {
  it("creates clients with the owner UID and returns a secret only after re-fetch verification", async () => {
    const pkg = packageFixture();
    livePackages = [pkg];

    const result = await credentialsCreateOrUpdate(
      { clientId: "my-app", name: "My app" },
      ownerOf(pkg),
    );

    expect(result.secret).toBe("secret-my-app");
    expect(result.attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(pkg.metadata?.uid);
    const createCall = mockFetch.mock.calls.find(
      ([url, options]) =>
        String(url).includes("/admin/realms/uds/clients") && options.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1].body)).attributes[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(
      pkg.metadata?.uid,
    );
    expect(
      mockFetch.mock.calls.some(
        ([url, options]) => options.method === "GET" && String(url).includes("created-1"),
      ),
    ).toBe(true);
  });

  it("updates an owned client by UUID and preserves the owner marker", async () => {
    const pkg = packageFixture();
    livePackages = [pkg];
    clients.push(
      clientFixture("my-app", pkg.metadata?.uid, {
        attributes: { existing: "kept", [PACKAGE_OWNER_UID_ATTRIBUTE]: pkg.metadata!.uid! },
      }),
    );

    const result = await credentialsCreateOrUpdate(
      { clientId: "my-app", name: "Updated app", attributes: { desired: "value" } },
      ownerOf(pkg),
    );

    expect(result.name).toBe("Updated app");
    expect(clients[0].attributes).toEqual({
      desired: "value",
      [PACKAGE_OWNER_UID_ATTRIBUTE]: pkg.metadata?.uid,
    });
    expect(
      mockFetch.mock.calls.some(
        ([url, options]) => options.method === "PUT" && String(url).endsWith(clients[0].id),
      ),
    ).toBe(true);
    expect(mockPackageGet).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign UID marker, including when namespace and name are reused", async () => {
    const recreated = packageFixture({
      uid: "new-package-uid",
      namespace: "same-ns",
      name: "same-name",
    });
    livePackages = [recreated];
    clients.push(clientFixture("my-app", "old-package-uid"));

    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app", name: "Changed" }, ownerOf(recreated)),
    ).rejects.toThrow("is not owned by Package");
    await expect(credentialsDelete({ clientId: "my-app" }, ownerOf(recreated))).rejects.toThrow(
      "is not owned by Package",
    );
    expect(
      mockFetch.mock.calls.some(
        ([, options]) => options.method === "PUT" || options.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("prevents mutations for invalid owners, duplicate claims, and incomplete Package lists", async () => {
    const current = packageFixture({ uid: "current-uid" });
    expect(() => ownerOf(packageFixture({ uid: "" }))).toThrow("metadata.uid");
    livePackages = [current];
    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app" }, { ...ownerOf(current), uid: "stale-uid" }),
    ).rejects.toThrow("not the sole current claimant");
    const hasClientMutation = () =>
      mockFetch.mock.calls.some(
        ([url, options]) =>
          String(url).includes("/admin/realms/uds/clients") &&
          ["POST", "PUT", "DELETE"].includes(String(options.method)),
      );
    expect(hasClientMutation()).toBe(false);

    mockFetch.mockClear();
    const duplicate = packageFixture({
      uid: "duplicate-uid",
      namespace: "other-ns",
      name: "other",
    });
    livePackages = [current, duplicate];
    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app" }, ownerOf(current)),
    ).rejects.toThrow("not the sole current claimant");
    expect(hasClientMutation()).toBe(false);

    mockFetch.mockClear();
    mockPackageGet.mockRejectedValueOnce(new Error("Kubernetes list failed"));
    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app" }, ownerOf(current)),
    ).rejects.toThrow("Kubernetes list failed");
    expect(hasClientMutation()).toBe(false);

    mockPackageGet.mockResolvedValueOnce({ items: livePackages, metadata: { continue: "more" } });
    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app" }, ownerOf(current)),
    ).rejects.toThrow("incomplete Package list");

    mockPackageGet.mockResolvedValueOnce({ metadata: {} });
    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app" }, ownerOf(current)),
    ).rejects.toThrow("incomplete Package list");
    expect(hasClientMutation()).toBe(false);
  });

  it("adopts a legacy ordinary client with unique status history when groups are absent", async () => {
    const pkg = packageFixture({ statusClientIds: ["my-app"] });
    livePackages = [pkg];
    // v1.15.0 wrote this attribute, but Keycloak may omit it on a later read.
    clients.push(clientFixture("my-app", undefined, { attributes: {} }));

    const result = await credentialsCreateOrUpdate(
      {
        clientId: "my-app",
        name: "My app",
        attributes: { "uds.core.groups": "", "custom.attribute": "keep" },
      },
      ownerOf(pkg),
    );

    expect(result.secret).toBe("secret-my-app");
    expect(result.attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(pkg.metadata?.uid);
  });

  it("adopts public clients without depending on a Kubernetes Secret", async () => {
    const pkg = packageFixture({ statusClientIds: ["my-app"] });
    livePackages = [pkg];
    clients.push(
      clientFixture("my-app", undefined, {
        attributes: {},
        publicClient: true,
        secret: undefined,
      }),
    );

    const synced = await syncClient({ ...pkg.spec!.sso![0], publicClient: true }, pkg);

    expect(synced.attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(pkg.metadata?.uid);
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockSecretNamespace.mock.calls).toEqual([["keycloak"]]);
  });

  it("adopts a legacy client with a custom template without reading an existing app Secret", async () => {
    const pkg = packageFixture({ statusClientIds: ["my-app"] });
    livePackages = [pkg];
    clients.push(clientFixture("my-app", undefined, { attributes: {} }));

    await syncClient(
      {
        ...pkg.spec!.sso![0],
        secretConfig: {
          name: "custom-client-secret",
          template: { CLIENT_SECRET: "clientField(secret)" },
        },
      },
      pkg,
    );

    expect(clients[0].attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(pkg.metadata?.uid);
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "custom-client-secret" }),
        data: { CLIENT_SECRET: Buffer.from("secret-my-app").toString("base64") },
      }),
    );
    // The application Secret is only written; the sole read is the Keycloak token Secret.
    expect(mockSecretGet).toHaveBeenCalledTimes(1);
    expect(mockSecretNamespace.mock.calls).toEqual([["keycloak"]]);
  });

  it("does not publish a Secret when the legacy marker cannot be verified", async () => {
    const pkg = packageFixture({ statusClientIds: ["my-app"] });
    livePackages = [pkg];
    clients.push(clientFixture("my-app", undefined, { attributes: {} }));
    stripOwnerMarkerAfterPut = true;

    await expect(syncClient(pkg.spec!.sso![0], pkg)).rejects.toThrow(
      "Failed to process Keycloak request",
    );

    expect(mockFetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(true);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("does not adopt an unmarked client after Package recreation without its status history", async () => {
    const pkg = packageFixture({ uid: "recreated-package-uid" });
    livePackages = [pkg];
    clients.push(
      clientFixture("my-app", undefined, { attributes: { "custom.attribute": "value" } }),
    );

    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app", name: "My app" }, ownerOf(pkg)),
    ).rejects.toThrow("no recorded history");
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(false);
  });

  it("does not adopt a legacy client when another Package records the same ID", async () => {
    const pkg = packageFixture({ statusClientIds: ["my-app"] });
    const other = packageFixture({
      uid: "other-package-uid",
      namespace: "other-ns",
      name: "other-package",
      clientId: "other-app",
      statusClientIds: ["my-app"],
    });
    livePackages = [pkg, other];
    clients.push(clientFixture("my-app", undefined, { attributes: {} }));

    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app", name: "My app" }, ownerOf(pkg)),
    ).rejects.toThrow("ambiguous Package history");
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(false);
  });

  it("recognizes generated probe IDs in live ownership checks and legacy adoption", async () => {
    const pkg = packageFixture({ includeProbe: true, statusClientIds: ["my-app-probe"] });
    livePackages = [pkg];
    clients.push(clientFixture("my-app-probe", undefined, { attributes: {} }));

    const result = await credentialsCreateOrUpdate(
      {
        clientId: "my-app-probe",
        name: "App Probe",
        attributes: {},
        fullScopeAllowed: false,
        serviceAccountsEnabled: true,
        standardFlowEnabled: false,
      },
      ownerOf(pkg),
    );

    expect(result.attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(pkg.metadata?.uid);
  });

  it("deletes a missing client idempotently", async () => {
    await expect(
      credentialsDelete({ clientId: "already-gone" }, ownerOf(packageFixture())),
    ).resolves.toBeUndefined();
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  });

  it("deletes unmarked ordinary and probe clients during finalization while IDs remain in the spec", async () => {
    const pkg = packageFixture({
      includeProbe: true,
      statusClientIds: ["my-app", "my-app-probe"],
    });
    livePackages = [pkg];
    clients.push(
      clientFixture("my-app", undefined, { attributes: {} }),
      clientFixture("my-app-probe", undefined, { attributes: {} }),
    );

    await expect(credentialsDelete({ clientId: "my-app" }, ownerOf(pkg))).resolves.toBeUndefined();
    await expect(
      credentialsDelete({ clientId: "my-app-probe" }, ownerOf(pkg)),
    ).resolves.toBeUndefined();

    expect(clients).toHaveLength(0);
    expect(mockFetch.mock.calls.filter(([, options]) => options.method === "DELETE")).toHaveLength(
      2,
    );
  });

  it("refuses legacy deletion when the Package has no recorded history", async () => {
    const pkg = packageFixture();
    livePackages = [pkg];
    clients.push(clientFixture("my-app", undefined, { attributes: {} }));

    await expect(credentialsDelete({ clientId: "my-app" }, ownerOf(pkg))).rejects.toThrow(
      "no recorded history",
    );

    expect(clients).toHaveLength(1);
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  });

  it("allows the marked owner to delete during an ID handoff", async () => {
    const formerOwner = packageFixture({
      uid: "package-uid-a",
      statusClientIds: ["my-app"],
    });
    formerOwner.spec!.sso = [];
    formerOwner.spec!.network = {};
    const newOwner = packageFixture({
      uid: "package-uid-b",
      namespace: "new-ns",
      name: "new-package",
      clientId: "my-app",
    });
    livePackages = [formerOwner, newOwner];
    clients.push(clientFixture("my-app", formerOwner.metadata?.uid));

    await expect(
      credentialsDelete({ clientId: "my-app" }, ownerOf(formerOwner)),
    ).resolves.toBeUndefined();

    // The Keycloak delete succeeded, but assume A's subsequent status write
    // failed: its recorded client ID must remain available for retry.
    expect(formerOwner.status?.ssoClients).toEqual(["my-app"]);
    const created = await credentialsCreateOrUpdate(
      { clientId: "my-app", name: "New owner" },
      ownerOf(newOwner),
    );

    expect(created.secret).toBe("secret-my-app");
    expect(created.attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(newOwner.metadata?.uid);
    newOwner.status = { ssoClients: ["my-app"] };

    const deletesBeforeRetry = mockFetch.mock.calls.filter(
      ([, options]) => options.method === "DELETE",
    ).length;
    await expect(
      credentialsDelete({ clientId: "my-app" }, ownerOf(formerOwner)),
    ).resolves.toBeUndefined();

    expect(formerOwner.status?.ssoClients).toEqual(["my-app"]);
    expect(clients).toHaveLength(1);
    expect(clients[0].attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE]).toBe(newOwner.metadata?.uid);
    expect(mockFetch.mock.calls.filter(([, options]) => options.method === "DELETE")).toHaveLength(
      deletesBeforeRetry,
    );
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(true);
  });

  it("does not treat an unexplained foreign marker as completed cleanup", async () => {
    const formerOwner = packageFixture({
      uid: "package-uid-a",
      statusClientIds: ["my-app"],
    });
    formerOwner.spec!.sso = [];
    formerOwner.spec!.network = {};
    const unrelatedOwner = packageFixture({
      uid: "package-uid-b",
      namespace: "new-ns",
      name: "new-package",
      clientId: "another-app",
    });
    livePackages = [formerOwner, unrelatedOwner];
    clients.push(clientFixture("my-app", unrelatedOwner.metadata?.uid));

    await expect(credentialsDelete({ clientId: "my-app" }, ownerOf(formerOwner))).rejects.toThrow(
      "is not owned by Package",
    );
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  });

  it("deletes a disabled legacy probe from unique Package status history", async () => {
    const pkg = packageFixture({ includeProbe: true, statusClientIds: ["my-app-probe"] });
    pkg.spec!.network!.expose![0].uptime!.checks!.paths = [];
    livePackages = [pkg];
    clients.push(clientFixture("my-app-probe", undefined, { attributes: {} }));

    await expect(
      credentialsDelete({ clientId: "my-app-probe" }, ownerOf(pkg)),
    ).resolves.toBeUndefined();

    expect(clients).toHaveLength(0);
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(true);
  });

  it("deletes unmarked ordinary and probe clients after the entire SSO entry is removed", async () => {
    const pkg = packageFixture({
      includeProbe: true,
      statusClientIds: ["my-app", "my-app-probe"],
    });
    pkg.spec!.sso = [];
    pkg.spec!.network = {};
    livePackages = [pkg];
    clients.push(
      clientFixture("my-app", undefined, {
        attributes: {},
      }),
      clientFixture("my-app-probe", undefined, { attributes: {} }),
    );

    await credentialsDelete({ clientId: "my-app" }, ownerOf(pkg));
    await credentialsDelete({ clientId: "my-app-probe" }, ownerOf(pkg));

    expect(clients).toHaveLength(0);
    expect(mockFetch.mock.calls.filter(([, options]) => options.method === "DELETE")).toHaveLength(
      2,
    );
  });

  it("refuses legacy deletion when another Package records the ID", async () => {
    const pkg = packageFixture({ includeProbe: true, statusClientIds: ["my-app-probe"] });
    pkg.spec!.network!.expose![0].uptime!.checks!.paths = [];
    const other = packageFixture({
      uid: "other-package-uid",
      namespace: "other-ns",
      name: "other-package",
      clientId: "other-app",
      statusClientIds: ["my-app-probe"],
    });
    livePackages = [pkg, other];
    clients.push(clientFixture("my-app-probe", undefined, { attributes: {} }));

    await expect(credentialsDelete({ clientId: "my-app-probe" }, ownerOf(pkg))).rejects.toThrow(
      "ambiguous Package history",
    );
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  });

  it("refuses legacy deletion when another current spec claims the ID", async () => {
    const pkg = packageFixture({ includeProbe: true, statusClientIds: ["my-app-probe"] });
    pkg.spec!.network!.expose![0].uptime!.checks!.paths = [];
    const other = packageFixture({
      uid: "other-package-uid",
      namespace: "other-ns",
      name: "other-package",
      clientId: "my-app-probe",
    });
    livePackages = [pkg, other];
    clients.push(clientFixture("my-app-probe", undefined, { attributes: {} }));

    await expect(credentialsDelete({ clientId: "my-app-probe" }, ownerOf(pkg))).rejects.toThrow(
      "another Package currently claims it",
    );
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "DELETE")).toBe(false);
  });

  it("does not update after a create conflict until it rechecks and verifies the appeared client", async () => {
    const pkg = packageFixture();
    livePackages = [pkg];
    conflictOnCreate = clientFixture("my-app", "different-package-uid");

    await expect(
      credentialsCreateOrUpdate({ clientId: "my-app", name: "My app" }, ownerOf(pkg)),
    ).rejects.toThrow("is not owned by Package");
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(false);
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "POST")).toBe(true);
  });

  it("rejects ambiguous exact matches and inexact conflict lookups without returning a secret", async () => {
    const pkg = packageFixture();
    livePackages = [pkg];
    clients.push(clientFixture("my-app", pkg.metadata?.uid));
    clients.push({ ...clientFixture("my-app", pkg.metadata?.uid), id: "second-uuid" });
    await expect(credentialsCreateOrUpdate({ clientId: "my-app" }, ownerOf(pkg))).rejects.toThrow(
      "multiple exact matches",
    );
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(false);

    clients.splice(0, clients.length);
    mockFetch.mockClear();
    inexactSearchFor = "my-app";
    inexactSearchClient = clientFixture("my-app-extra", "other-uid");
    conflictOnCreate = clientFixture("my-app", "different-package-uid");
    await expect(credentialsCreateOrUpdate({ clientId: "my-app" }, ownerOf(pkg))).rejects.toThrow(
      "no exact client match",
    );
    expect(mockFetch.mock.calls.some(([, options]) => options.method === "PUT")).toBe(false);
  });
});
