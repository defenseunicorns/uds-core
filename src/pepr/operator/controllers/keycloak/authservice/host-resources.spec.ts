/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s } from "pepr";
import { expect, it, vi } from "vitest";
import { IstioVirtualService } from "../../../crd";
import { deleteResourceIfUnchanged } from "../../utils";
import { applyHostPolicies, cleanupHostAuthentication, purgeHostPolicies } from "./host-resources";

vi.mock("pepr", async importOriginal => ({
  ...(await importOriginal<typeof import("pepr")>()),
  K8s: vi.fn(),
}));
vi.mock("../../utils", async importOriginal => ({
  ...(await importOriginal<typeof import("../../utils")>()),
  deleteResourceIfUnchanged: vi.fn(),
  retryWithDelay: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

it.each([false, true])(
  "applies manifests in enforcement order and stops on failure (%s)",
  async fail => {
    const apply = vi.fn().mockResolvedValue(undefined);
    if (fail)
      apply.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("apply failed"));
    vi.mocked(K8s).mockReturnValue({
      Get: vi.fn().mockResolvedValue({ metadata: { uid: "namespace-uid" } }),
      Apply: apply,
    } as unknown as ReturnType<typeof K8s>);
    const pkg = {
      metadata: { name: "app", namespace: "app", uid: "pkg", generation: 1 },
      spec: {
        network: { expose: [{ host: "app", service: "web", port: 80, selector: { app: "web" } }] },
        sso: [{ name: "browser", clientId: "browser", authservice: { exposeHost: "app" } }],
      },
    };
    if (fail) await expect(applyHostPolicies(pkg)).rejects.toThrow("apply failed");
    else await applyHostPolicies(pkg);
    const expected = [
      ["TrafficExtension", "channel"],
      ["AuthorizationPolicy", "browser"],
      ["AuthorizationPolicy", "ingress"],
      ["AuthorizationPolicy", "workload"],
      ["RequestAuthentication", "ingress"],
      ["RequestAuthentication", "workload"],
      ["TrafficExtension", "forward"],
    ];
    expect(
      apply.mock.calls.map(([resource]) => [
        resource.kind,
        resource.metadata.name.split("-").at(-1),
      ]),
    ).toEqual(fail ? expected.slice(0, 2) : expected);
    for (const [, options] of apply.mock.calls) expect(options).toEqual({ force: true });
  },
);

it("cleans up policies only after protected routes disappear", async () => {
  const route = { metadata: { name: "test-route", uid: "route-uid", resourceVersion: "1" } };
  const listRoutes = vi.fn().mockResolvedValue({ items: [route] });
  const routeQuery = { WithLabel: vi.fn().mockReturnThis(), Get: listRoutes };
  const policyQuery = {
    WithLabel: vi.fn().mockReturnThis(),
    Get: vi.fn().mockResolvedValue({ items: [] }),
  };
  vi.mocked(K8s).mockImplementation(
    model =>
      ({
        InNamespace: () => (model === IstioVirtualService ? routeQuery : policyQuery),
      }) as unknown as ReturnType<typeof K8s>,
  );
  vi.mocked(deleteResourceIfUnchanged).mockClear().mockResolvedValue(true);

  const pkg = { metadata: { name: "app", uid: "pkg", namespace: "app", generation: 1 } };
  await expect(cleanupHostAuthentication(pkg)).rejects.toThrow(/VirtualServices/);
  expect(deleteResourceIfUnchanged).toHaveBeenCalledWith(route);
  expect(policyQuery.Get).not.toHaveBeenCalled();

  listRoutes.mockResolvedValue({ items: [] });
  await cleanupHostAuthentication(pkg);
  expect(policyQuery.Get).toHaveBeenCalled();
});

it.each([true, false])("waits for obsolete resources after DELETE returns %s", async deleted => {
  const stale = {
    metadata: { name: "host-auth-pkg-1-0-browser", labels: { "uds/generation": "1" } },
  };
  const future = {
    metadata: { name: "host-auth-pkg-3-0-browser", labels: { "uds/generation": "3" } },
  };
  const get = vi.fn().mockResolvedValue({ items: [stale, future] });
  const query = { WithLabel: vi.fn().mockReturnThis(), Get: get };
  vi.mocked(K8s).mockReturnValue({
    InNamespace: () => query,
  } as unknown as ReturnType<typeof K8s>);
  vi.mocked(deleteResourceIfUnchanged).mockClear().mockResolvedValue(deleted);
  const pkg = { metadata: { name: "app", uid: "pkg", namespace: "app", generation: 2 } };

  await expect(purgeHostPolicies(pkg)).rejects.toThrow(/obsolete host policies/);
  expect(deleteResourceIfUnchanged).toHaveBeenCalledExactlyOnceWith(stale);

  get.mockResolvedValue({ items: [future] });
  await expect(purgeHostPolicies(pkg)).resolves.toBeUndefined();
  expect(deleteResourceIfUnchanged).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "preserves another Package's policies during cleanup (deleting=%s)",
  async deleting => {
    const foreign = {
      metadata: { name: "host-auth-other-1-0-browser", labels: { "uds/generation": "1" } },
    };
    const query = {
      WithLabel: vi.fn().mockReturnThis(),
      Get: vi.fn().mockResolvedValue({ items: [foreign] }),
    };
    vi.mocked(K8s).mockReturnValue({
      InNamespace: () => query,
    } as unknown as ReturnType<typeof K8s>);
    vi.mocked(deleteResourceIfUnchanged).mockClear();

    await purgeHostPolicies(
      { metadata: { name: "app", namespace: "app", uid: "pkg", generation: 2 } },
      deleting,
    );

    expect(query.WithLabel).toHaveBeenCalledWith("uds/package", "app");
    expect(query.WithLabel).toHaveBeenCalledWith("uds/for", "host-auth");
    expect(deleteResourceIfUnchanged).not.toHaveBeenCalled();
  },
);
