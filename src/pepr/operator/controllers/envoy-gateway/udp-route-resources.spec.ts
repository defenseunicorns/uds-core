/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { K8s } from "pepr";
import { K8sGateway, K8sUDPRoute, UDSPackage } from "../../crd";
import { ExposeProtocol } from "../../crd/generated/package-v1alpha1";
import { envoyDefaultGatewayName, envoyDefaultGatewayNamespace } from "./constants";
import { envoyGatewayResources, reconcileDefaultGatewayListeners } from "./udp-route-resources";

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

  it("generates UDPRoute and default Gateway listener for default mode", async () => {
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

    await envoyGatewayResources(pkg, "game-ns");

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
    expect(clientFor(K8sGateway).Apply).not.toHaveBeenCalled();
  });

  it("skips applying Gateway API resources for packages without UDP expose entries", async () => {
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

    await envoyGatewayResources(pkg, "web-ns");

    expect(clientFor(K8sUDPRoute).Apply).not.toHaveBeenCalled();
    expect(clients.has(K8sGateway)).toBe(false);
  });

  it("purges stale UDPRoutes even when generated UDP NetworkPolicies are gone", async () => {
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

    await envoyGatewayResources(pkg, "web-ns");

    expect(clientFor(K8sUDPRoute).Delete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: "web-udp-old" }) }),
    );
  });

  it("purges generated UDPRoutes when UDP expose entries were removed", async () => {
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

    await envoyGatewayResources(pkg, "web-ns");

    expect(clientFor(K8sUDPRoute).Delete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ name: "web-udp-old" }) }),
    );
    expect(clientFor(K8sGateway).Apply).not.toHaveBeenCalled();
  });

  it("fetches fresh packages when a dirty default Gateway reconciliation re-runs", async () => {
    const pkg = packageFixture();
    let releaseFirstApply: () => void = () => undefined;
    const firstApplyStarted = new Promise<void>(resolve => {
      vi.mocked(K8s).mockImplementation(((resourceKind: unknown) => {
        const existingClient = clients.get(resourceKind);
        if (existingClient) return existingClient;

        const client: K8sClient = {
          Apply: vi.fn(async () => {
            if (resourceKind === K8sGateway) {
              resolve();
              await new Promise<void>(release => {
                releaseFirstApply = release;
              });
            }
          }),
          Delete: vi.fn(async () => undefined),
          Get: vi.fn(async () => (resourceKind === UDSPackage ? { items: [] } : { items: [] })),
          InNamespace: vi.fn(() => client),
          WithLabel: vi.fn(() => client),
        };

        clients.set(resourceKind, client);
        return client;
      }) as never);
    });

    const firstReconcile = reconcileDefaultGatewayListeners([pkg]);
    await firstApplyStarted;

    const secondReconcile = reconcileDefaultGatewayListeners();
    releaseFirstApply();
    await Promise.all([firstReconcile, secondReconcile]);

    expect(clientFor(UDSPackage).Get).toHaveBeenCalled();
    expect(clientFor(K8sGateway).Delete).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: envoyDefaultGatewayName, namespace: envoyDefaultGatewayNamespace },
      }),
    );
  });
});
