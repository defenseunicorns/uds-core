/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Expose, Sso, UDSPackage } from "../../crd";
import { UDSConfig } from "../config/config";
import { getAuthserviceSso, getProbeClientId } from "./probe-client-utils";
import { createProbeKeycloakClient, generateProbe, probe } from "./probe";

const { credentialsCreateOrUpdate, mockUpdateBlackboxConfig, mockPatchStatus, mockApply } =
  vi.hoisted(() => ({
    credentialsCreateOrUpdate: vi.fn(),
    mockUpdateBlackboxConfig: vi.fn(),
    mockPatchStatus: vi.fn().mockResolvedValue({}),
    mockApply: vi.fn().mockResolvedValue({}),
  }));

vi.mock("../keycloak/clients/client-credentials", () => ({
  credentialsCreateOrUpdate,
}));
vi.mock("./config", () => ({ updateBlackboxConfig: mockUpdateBlackboxConfig }));
vi.mock("pepr", async importOriginal => {
  const actual = await importOriginal<typeof import("pepr")>();
  return {
    ...actual,
    K8s: () => ({ Apply: mockApply, PatchStatus: mockPatchStatus }),
  };
});

UDSConfig.domain = "uds.dev";
UDSConfig.adminDomain = "admin.uds.dev";

describe("generateProbe", () => {
  const ownerRefs = [
    {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      name: "test",
      uid: "f50120aa-2713-4502-9496-566b102b1174",
    },
  ];

  it("should return a valid Probe object", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: {
        checks: {
          paths: ["/"],
        },
      },
    };
    const namespace = "test";
    const pkgName = "test";
    const generation = "1";

    const payload = generateProbe(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual("uds-app-tenant-uptime");
    expect(payload.spec?.module).toEqual("http_2xx");
    expect(payload.spec?.prober?.url).toEqual(
      "prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115",
    );
    expect(payload.spec?.targets?.staticConfig?.static).toEqual(["https://app.uds.dev/"]);
  });

  it("should use custom paths when specified", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: {
        checks: {
          paths: ["/health", "/ready"],
        },
      },
    };

    const payload = generateProbe(expose, "test", "test", "1", ownerRefs);

    expect(payload.spec?.targets?.staticConfig?.static).toEqual([
      "https://app.uds.dev/health",
      "https://app.uds.dev/ready",
    ]);
  });

  it("should use a custom SSO module when specified", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: { checks: { paths: ["/"] } },
    };

    const payload = generateProbe(
      expose,
      "my-ns",
      "test",
      "1",
      ownerRefs,
      "http_200x_sso_my-ns_uds-app-probe",
    );

    expect(payload.spec?.module).toEqual("http_200x_sso_my-ns_uds-app-probe");
  });

  it("should set owner references and generation label", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: { checks: { paths: ["/"] } },
    };

    const payload = generateProbe(expose, "test-ns", "my-pkg", "5", ownerRefs);

    expect(payload.metadata?.ownerReferences).toEqual(ownerRefs);
    expect(payload.metadata?.labels?.["uds/package"]).toEqual("my-pkg");
    expect(payload.metadata?.labels?.["uds/generation"]).toEqual("5");
    expect(payload.metadata?.namespace).toEqual("test-ns");
  });
});

describe("getAuthserviceSso", () => {
  it("returns undefined when sso list is empty", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    expect(getAuthserviceSso(expose, [])).toBeUndefined();
  });

  it("returns undefined when no SSO entry has enableAuthserviceSelector", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const ssoEntries: Sso[] = [
      { name: "App SSO", clientId: "uds-app", redirectUris: ["https://app.uds.dev/login"] },
    ];
    expect(getAuthserviceSso(expose, ssoEntries)).toBeUndefined();
  });

  it("returns undefined when redirect URIs don't match the expose FQDN", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const ssoEntries: Sso[] = [
      {
        name: "Other SSO",
        clientId: "uds-other",
        redirectUris: ["https://other.uds.dev/login"],
        enableAuthserviceSelector: { app: "other" },
      },
    ];
    expect(getAuthserviceSso(expose, ssoEntries)).toBeUndefined();
  });

  it("returns matching SSO entry when a redirect URI origin matches the expose FQDN", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const matchingSso: Sso = {
      name: "App SSO",
      clientId: "uds-app",
      redirectUris: ["https://app.uds.dev/login"],
      enableAuthserviceSelector: { app: "app" },
    };
    expect(getAuthserviceSso(expose, [matchingSso])).toBe(matchingSso);
  });

  it("matches on origin only, ignoring redirect URI path", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const sso: Sso = {
      name: "App SSO",
      clientId: "uds-app",
      redirectUris: ["https://app.uds.dev/some/deep/callback"],
      enableAuthserviceSelector: { app: "app" },
    };
    expect(getAuthserviceSso(expose, [sso])).toBe(sso);
  });

  it("returns the first matching SSO entry when multiple match", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const first: Sso = {
      name: "First SSO",
      clientId: "first",
      redirectUris: ["https://app.uds.dev/login"],
      enableAuthserviceSelector: { app: "app" },
    };
    const second: Sso = {
      name: "Second SSO",
      clientId: "second",
      redirectUris: ["https://app.uds.dev/callback"],
      enableAuthserviceSelector: { app: "app" },
    };
    expect(getAuthserviceSso(expose, [first, second])).toBe(first);
  });

  it("skips SSO entries with invalid redirect URIs gracefully", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const ssoEntries: Sso[] = [
      {
        name: "Bad SSO",
        clientId: "bad",
        redirectUris: ["not-a-valid-url"],
        enableAuthserviceSelector: { app: "bad" },
      },
    ];
    expect(getAuthserviceSso(expose, ssoEntries)).toBeUndefined();
  });

  it("does not match SSO entries with enableAuthserviceSelector null/undefined", () => {
    const expose: Expose = { host: "app", gateway: "tenant" };
    const ssoEntries: Sso[] = [
      {
        name: "App SSO",
        clientId: "uds-app",
        redirectUris: ["https://app.uds.dev/login"],
        enableAuthserviceSelector: undefined,
      },
    ];
    expect(getAuthserviceSso(expose, ssoEntries)).toBeUndefined();
  });
});

describe("createProbeKeycloakClient", () => {
  const probePackage = (): UDSPackage => ({
    metadata: { name: "app", namespace: "app-ns", uid: "package-uid" },
    spec: {
      sso: [
        {
          name: "App SSO",
          clientId: "uds-app",
          redirectUris: ["https://app.uds.dev/login"],
          enableAuthserviceSelector: { app: "app" },
        },
      ],
      network: {
        expose: [{ host: "app", uptime: { checks: { paths: ["/health"] } } }],
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPatchStatus.mockReset().mockResolvedValue({});
    mockApply.mockResolvedValue({});
  });

  it("disables full scope for the probe client", async () => {
    const expectedProbeClientId = getProbeClientId("uds-app");
    credentialsCreateOrUpdate.mockResolvedValue({
      clientId: expectedProbeClientId,
      secret: "secret",
    });

    const pkg = probePackage();
    await createProbeKeycloakClient(pkg.spec!.sso![0], pkg);

    expect(credentialsCreateOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: expectedProbeClientId,
        fullScopeAllowed: false,
      }),
      { uid: "package-uid", namespace: "app-ns", name: "app" },
    );
    expect(mockPatchStatus).toHaveBeenCalledWith({
      metadata: { name: "app", namespace: "app-ns" },
      status: { ssoClients: [expectedProbeClientId] },
    });
    expect(expectedProbeClientId).toBe("uds-app-probe");
  });

  it("does not update Blackbox credentials when the Package does not own its probe client", async () => {
    credentialsCreateOrUpdate.mockRejectedValueOnce(new Error("owner UID mismatch"));
    const pkg = probePackage();

    await expect(probe(pkg, "app-ns")).rejects.toThrow("Failed to process Probes");
    expect(mockUpdateBlackboxConfig).not.toHaveBeenCalled();
    expect(mockPatchStatus).not.toHaveBeenCalled();
  });

  it("does not update Blackbox credentials if probe ownership history cannot be persisted", async () => {
    credentialsCreateOrUpdate.mockResolvedValueOnce({
      clientId: "uds-app-probe",
      secret: "secret",
    });
    mockPatchStatus.mockRejectedValue(new Error("status unavailable"));
    const pkg = probePackage();

    await expect(probe(pkg, "app-ns")).rejects.toThrow("Failed to process Probes");
    expect(mockPatchStatus).toHaveBeenCalledTimes(2);
    expect(mockUpdateBlackboxConfig).not.toHaveBeenCalled();
  });
});
