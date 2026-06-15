/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { K8s, kind } from "pepr";
import { K8sGateway, K8sUDPRoute, UDSPackage } from "../../crd";
import { ExposeProtocol } from "../../crd/generated/package-v1alpha1";
import { UDSConfig } from "../config/config";
import {
  envoyDefaultGatewayName,
  envoyDefaultGatewayNamespace,
  envoyGatewayResources,
} from "./udp-route-resources";

vi.mock("pepr", () => ({
  K8s: vi.fn(),
  kind: {
    Namespace: "Namespace",
    NetworkPolicy: "NetworkPolicy",
  },
  Log: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

type K8sClient = {
  Apply: ReturnType<typeof vi.fn>;
  Delete: ReturnType<typeof vi.fn>;
  Get: ReturnType<typeof vi.fn>;
  InNamespace: ReturnType<typeof vi.fn>;
  WithLabel: ReturnType<typeof vi.fn>;
};

function packageFixture(overrides: Partial<UDSPackage> = {}): UDSPackage {
  return {
    apiVersion: "uds.dev/v1alpha1",
    kind: "Package",
    metadata: {
      name: "game",
      namespace: "game-ns",
      uid: "uid-a",
      generation: 3,
      creationTimestamp: new Date("2026-01-01T00:00:00Z"),
    },
    spec: {
      network: {
        expose: [
          {
            protocol: ExposeProtocol.UDP,
            description: "game-server",
            service: "game-server",
            selector: { app: "game" },
            port: 7777,
            targetPort: 7778,
          },
        ],
      },
    },
    ...overrides,
  } as UDSPackage;
}

describe("envoyGatewayResources", () => {
  const clients = new Map<unknown, K8sClient>();

  beforeEach(() => {
    vi.clearAllMocks();
    clients.clear();
    UDSConfig.isEnvoyGatewayDefaultEnabled = true;

    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async () => ({ items: [] })),
        InNamespace: vi.fn(() => client),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);
  });

  function clientFor(resourceKind: unknown): K8sClient {
    const client = clients.get(resourceKind);
    if (!client) {
      throw new Error(`Missing client for ${String(resourceKind)}`);
    }
    return client;
  }

  it("generates UDPRoute, UDP NetworkPolicy, and default Gateway listener for default mode", async () => {
    const pkg = packageFixture();
    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async () => (resourceKind === UDSPackage ? { items: [pkg] } : { items: [] })),
        InNamespace: vi.fn(() => client),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);

    const result = await envoyGatewayResources(pkg, "game-ns");

    expect(result).toMatchObject({ defaultDisabled: false, portConflict: false });
    expect(clientFor(K8sUDPRoute).Apply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "game-udp-game-server", namespace: "game-ns" }),
        spec: expect.objectContaining({
          parentRefs: [
            expect.objectContaining({
              name: envoyDefaultGatewayName,
              namespace: envoyDefaultGatewayNamespace,
              sectionName: "udp-7777",
            }),
          ],
        }),
      }),
      { force: true },
    );
    expect(clientFor(kind.NetworkPolicy).Apply).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({
          ingress: [
            expect.objectContaining({
              ports: [{ port: 7778, protocol: "UDP" }],
            }),
          ],
        }),
      }),
      { force: true },
    );
    expect(clientFor(K8sGateway).Apply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: envoyDefaultGatewayName, namespace: envoyDefaultGatewayNamespace },
        spec: expect.objectContaining({
          listeners: [
            expect.objectContaining({
              name: "udp-7777",
              protocol: "UDP",
              port: 7777,
            }),
          ],
        }),
      }),
      { force: true },
    );
  });

  it("generates only route and network policy for user-managed mode", async () => {
    const pkg = packageFixture({
      spec: {
        network: {
          expose: [
            {
              protocol: ExposeProtocol.UDP,
              gateway: "custom-gateway",
              service: "game-server",
              selector: { app: "game" },
              port: 7777,
            },
          ],
        },
      },
    });

    await envoyGatewayResources(pkg, "game-ns");

    expect(clientFor(K8sUDPRoute).Apply).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({
          parentRefs: [
            expect.not.objectContaining({
              sectionName: expect.anything(),
            }),
          ],
        }),
      }),
      { force: true },
    );
    expect(clientFor(kind.NetworkPolicy).Apply).toHaveBeenCalledTimes(1);
    expect(clientFor(K8sGateway).Apply).not.toHaveBeenCalled();
  });

  it("sets defaultDisabled and skips default-mode resources when Envoy Gateway is disabled", async () => {
    UDSConfig.isEnvoyGatewayDefaultEnabled = false;
    const pkg = packageFixture();
    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      let namespace: string | undefined;
      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async () => {
          if (resourceKind === UDSPackage && namespace === "envoy-gateway-system") {
            throw { status: 404 };
          }
          return { items: [] };
        }),
        InNamespace: vi.fn((value: string) => {
          namespace = value;
          return client;
        }),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);

    const result = await envoyGatewayResources(pkg, "game-ns");

    expect(result.defaultDisabled).toBe(true);
    expect(clientFor(K8sUDPRoute).Apply).not.toHaveBeenCalled();
    expect(clientFor(kind.NetworkPolicy).Apply).not.toHaveBeenCalled();
    expect(clients.has(K8sGateway)).toBe(false);
  });

  it("reconciles default-mode resources when the Envoy Gateway package exists after operator restart", async () => {
    UDSConfig.isEnvoyGatewayDefaultEnabled = false;
    const pkg = packageFixture();
    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      let namespace: string | undefined;
      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async (name?: string) => {
          if (
            resourceKind === UDSPackage &&
            namespace === "envoy-gateway-system" &&
            name === "envoy-gateway"
          ) {
            return { metadata: { name: "envoy-gateway", namespace } };
          }
          if (resourceKind === UDSPackage) {
            return { items: [pkg] };
          }
          return { items: [] };
        }),
        InNamespace: vi.fn((value: string) => {
          namespace = value;
          return client;
        }),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);

    const result = await envoyGatewayResources(pkg, "game-ns");

    expect(result).toMatchObject({ defaultDisabled: false, portConflict: false });
    expect(UDSConfig.isEnvoyGatewayDefaultEnabled).toBe(true);
    expect(clientFor(K8sUDPRoute).Apply).toHaveBeenCalled();
    expect(clientFor(kind.NetworkPolicy).Apply).toHaveBeenCalled();
    expect(clientFor(K8sGateway).Apply).toHaveBeenCalled();
  });

  it("skips Gateway API work for packages without UDP expose entries", async () => {
    const pkg = packageFixture({
      metadata: {
        name: "web",
        namespace: "web-ns",
        uid: "uid-web",
        generation: 1,
        creationTimestamp: new Date("2026-01-03T00:00:00Z"),
      },
      spec: {
        network: {
          expose: [{ host: "app", service: "app", selector: { app: "app" }, port: 8080 }],
        },
      },
    });

    const result = await envoyGatewayResources(pkg, "web-ns");

    expect(result).toMatchObject({
      networkPolicies: [],
      defaultDisabled: false,
      portConflict: false,
    });
    expect(clients.has(K8sUDPRoute)).toBe(false);
    expect(clientFor(kind.NetworkPolicy).Apply).not.toHaveBeenCalled();
    expect(clients.has(K8sGateway)).toBe(false);
  });

  it("purges generated UDP resources when UDP expose entries were removed", async () => {
    const pkg = packageFixture({
      metadata: {
        name: "web",
        namespace: "web-ns",
        uid: "uid-web",
        generation: 2,
        creationTimestamp: new Date("2026-01-03T00:00:00Z"),
      },
      spec: {
        network: {
          expose: [{ host: "app", service: "app", selector: { app: "app" }, port: 8080 }],
        },
      },
    });

    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async () => {
          if (resourceKind === kind.NetworkPolicy) {
            return {
              items: [
                {
                  apiVersion: "networking.k8s.io/v1",
                  kind: "NetworkPolicy",
                  metadata: {
                    name: "web-old-udp",
                    namespace: "web-ns",
                    labels: {
                      "uds/package": "web",
                      "uds/generation": "1",
                      "uds/managed-by": "envoy-gateway",
                    },
                  },
                },
              ],
            };
          }

          if (resourceKind === K8sUDPRoute) {
            return {
              items: [
                {
                  apiVersion: "gateway.networking.k8s.io/v1alpha2",
                  kind: "UDPRoute",
                  metadata: {
                    name: "web-udp-old",
                    namespace: "web-ns",
                    labels: { "uds/package": "web", "uds/generation": "1" },
                  },
                },
              ],
            };
          }

          return { items: [] };
        }),
        InNamespace: vi.fn(() => client),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);

    const result = await envoyGatewayResources(pkg, "web-ns");

    expect(result).toMatchObject({ defaultDisabled: false, portConflict: false });
    expect(clientFor(K8sUDPRoute).Delete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: "web-udp-old" }) }),
    );
    expect(clientFor(kind.NetworkPolicy).Delete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: "web-old-udp" }) }),
    );
    expect(clientFor(K8sGateway).Apply).not.toHaveBeenCalled();
  });

  it("detects deterministic default-mode port conflicts and skips losing package resources", async () => {
    const winner = packageFixture();
    const loser = packageFixture({
      metadata: {
        name: "other-game",
        namespace: "other-ns",
        uid: "uid-b",
        generation: 1,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
      },
    });

    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async () =>
          resourceKind === UDSPackage ? { items: [winner, loser] } : { items: [] },
        ),
        InNamespace: vi.fn(() => client),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);

    const result = await envoyGatewayResources(loser, "other-ns");

    expect(result.portConflict).toBe(true);
    expect(clientFor(K8sUDPRoute).Apply).not.toHaveBeenCalled();
    expect(clientFor(kind.NetworkPolicy).Apply).not.toHaveBeenCalled();
  });

  it("uses uid as the default-mode port conflict tie-breaker", async () => {
    const winner = packageFixture({
      metadata: {
        name: "winner",
        namespace: "winner-ns",
        uid: "uid-a",
        generation: 1,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const loser = packageFixture({
      metadata: {
        name: "loser",
        namespace: "loser-ns",
        uid: "uid-b",
        generation: 1,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });

    vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
      const existingClient = clients.get(resourceKind);
      if (existingClient) return existingClient;

      const client: K8sClient = {
        Apply: vi.fn(async () => undefined),
        Delete: vi.fn(async () => undefined),
        Get: vi.fn(async () =>
          resourceKind === UDSPackage ? { items: [loser, winner] } : { items: [] },
        ),
        InNamespace: vi.fn(() => client),
        WithLabel: vi.fn(() => client),
      };

      clients.set(resourceKind, client);
      return client;
    }) as never);

    const result = await envoyGatewayResources(loser, "loser-ns");

    expect(result.portConflict).toBe(true);
    expect(clientFor(K8sUDPRoute).Apply).not.toHaveBeenCalled();
    expect(clientFor(kind.NetworkPolicy).Apply).not.toHaveBeenCalled();
  });
});
