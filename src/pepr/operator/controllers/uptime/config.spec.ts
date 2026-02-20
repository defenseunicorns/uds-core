/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { UDSConfig } from "../config/config";
import {
  BLACKBOX_BASE_CONFIG,
  BLACKBOX_CONFIG_NAMESPACE,
  BLACKBOX_CONFIG_SECRET_NAME,
  setupUptimeConfig,
  updateBlackboxConfig,
} from "./config";

vi.mock("pepr", () => {
  const mockLog = {
    child: vi.fn().mockReturnValue({
      fatal: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }),
  };
  return {
    K8s: vi.fn(),
    kind: { Secret: "Secret", Namespace: "Namespace" },
    Log: mockLog,
  };
});

function createMockK8sClient(overrides: Record<string, unknown> = {}) {
  const client = {
    Create: vi.fn().mockResolvedValue({}),
    Get: vi.fn().mockResolvedValue({}),
    Delete: vi.fn().mockResolvedValue({}),
    Apply: vi.fn().mockResolvedValue({}),
    InNamespace: vi.fn(),
    WithLabel: vi.fn().mockReturnThis(),
    ...overrides,
  };
  client.InNamespace.mockReturnValue(client);
  return client;
}

function makeBlackboxSecret(config: object) {
  return {
    metadata: { name: BLACKBOX_CONFIG_SECRET_NAME },
    data: { "blackbox.yaml": btoa(JSON.stringify(config)) },
  };
}

function getAppliedConfig(mockClient: ReturnType<typeof createMockK8sClient>) {
  const applyArg = mockClient.Apply.mock.calls[0][0];
  return JSON.parse(atob(applyArg.data["blackbox.yaml"]));
}

describe("updateBlackboxConfig", () => {
  let secretClient: ReturnType<typeof createMockK8sClient>;

  beforeEach(() => {
    UDSConfig.domain = "uds.dev";
    secretClient = createMockK8sClient();
    vi.mocked(K8s as Mock).mockReturnValue(secretClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds SSO modules for the given namespace", async () => {
    secretClient.Get.mockResolvedValue(makeBlackboxSecret({ modules: { http_2xx: {} } }));

    await updateBlackboxConfig("my-ns", [{ clientId: "my-client-probe", secret: "s3cr3t" }]);

    const applied = getAppliedConfig(secretClient);
    expect(applied.modules["http_200x_sso_my-ns_my-client-probe"]).toBeDefined();
    expect(applied.modules["http_2xx"]).toBeDefined();
  });

  it("generates correct OAuth2 config with the SSO token URL", async () => {
    secretClient.Get.mockResolvedValue(makeBlackboxSecret({ modules: {} }));

    await updateBlackboxConfig("my-ns", [{ clientId: "app-probe", secret: "mysecret" }]);

    const applied = getAppliedConfig(secretClient);
    const oauth2 = applied.modules["http_200x_sso_my-ns_app-probe"].http.oauth2;
    expect(oauth2).toMatchObject({
      client_id: "app-probe",
      client_secret: "mysecret",
      token_url: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token",
      endpoint_params: { grant_type: "client_credentials" },
    });
  });

  it("removes all SSO modules for a namespace when probeClients is empty", async () => {
    secretClient.Get.mockResolvedValue(
      makeBlackboxSecret({
        modules: {
          http_2xx: {},
          "http_200x_sso_my-ns_client-a": { prober: "http" },
          "http_200x_sso_other-ns_client-b": { prober: "http" },
        },
      }),
    );

    await updateBlackboxConfig("my-ns", []);

    const applied = getAppliedConfig(secretClient);
    expect(Object.keys(applied.modules)).not.toContain("http_200x_sso_my-ns_client-a");
    expect(applied.modules["http_200x_sso_other-ns_client-b"]).toBeDefined();
    expect(applied.modules["http_2xx"]).toBeDefined();
  });

  it("preserves modules from other namespaces", async () => {
    secretClient.Get.mockResolvedValue(
      makeBlackboxSecret({
        modules: {
          "http_200x_sso_ns-a_client": { prober: "http" },
          "http_200x_sso_ns-b_client": { prober: "http" },
        },
      }),
    );

    await updateBlackboxConfig("ns-a", [{ clientId: "new-client", secret: "s" }]);

    const applied = getAppliedConfig(secretClient);
    expect(applied.modules["http_200x_sso_ns-b_client"]).toBeDefined();
  });

  it("replaces old SSO modules for a namespace with new ones", async () => {
    secretClient.Get.mockResolvedValue(
      makeBlackboxSecret({
        modules: { "http_200x_sso_my-ns_old-client": { prober: "http" } },
      }),
    );

    await updateBlackboxConfig("my-ns", [{ clientId: "new-client", secret: "s" }]);

    const applied = getAppliedConfig(secretClient);
    expect(Object.keys(applied.modules)).not.toContain("http_200x_sso_my-ns_old-client");
    expect(applied.modules["http_200x_sso_my-ns_new-client"]).toBeDefined();
  });

  it("sorts all modules alphabetically", async () => {
    secretClient.Get.mockResolvedValue(
      makeBlackboxSecret({
        modules: {
          "http_200x_sso_z-ns_client": {},
          http_2xx: {},
        },
      }),
    );

    await updateBlackboxConfig("a-ns", [{ clientId: "aclient", secret: "s" }]);

    const applied = getAppliedConfig(secretClient);
    const keys = Object.keys(applied.modules);
    expect(keys).toEqual([...keys].sort());
  });

  it("writes the updated config to the correct secret", async () => {
    secretClient.Get.mockResolvedValue(makeBlackboxSecret({ modules: {} }));

    await updateBlackboxConfig("test-ns", []);

    const applyArg = secretClient.Apply.mock.calls[0][0];
    expect(applyArg.metadata).toMatchObject({
      namespace: BLACKBOX_CONFIG_NAMESPACE,
      name: BLACKBOX_CONFIG_SECRET_NAME,
    });
  });
});

describe("setupUptimeConfig", () => {
  let namespaceClient: ReturnType<typeof createMockK8sClient>;
  let secretClient: ReturnType<typeof createMockK8sClient>;

  beforeEach(() => {
    namespaceClient = createMockK8sClient();
    secretClient = createMockK8sClient();
    vi.mocked(K8s as Mock).mockImplementation((resourceType: string) => {
      if (resourceType === "Namespace") return namespaceClient;
      if (resourceType === "Secret") return secretClient;
      return createMockK8sClient();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PEPR_WATCH_MODE;
    delete process.env.PEPR_MODE;
  });

  it("does nothing when not in watch or dev mode", async () => {
    delete process.env.PEPR_WATCH_MODE;
    delete process.env.PEPR_MODE;

    await setupUptimeConfig();

    expect(K8s).not.toHaveBeenCalled();
  });

  it("runs when PEPR_WATCH_MODE is true", async () => {
    process.env.PEPR_WATCH_MODE = "true";
    namespaceClient.Get.mockResolvedValue({});
    secretClient.Get.mockResolvedValue(makeBlackboxSecret(BLACKBOX_BASE_CONFIG));

    await setupUptimeConfig();

    expect(K8s).toHaveBeenCalled();
  });

  it("runs when PEPR_MODE is dev", async () => {
    process.env.PEPR_MODE = "dev";
    namespaceClient.Get.mockResolvedValue({});
    secretClient.Get.mockResolvedValue(makeBlackboxSecret(BLACKBOX_BASE_CONFIG));

    await setupUptimeConfig();

    expect(K8s).toHaveBeenCalled();
  });

  it("skips namespace creation when it already exists", async () => {
    process.env.PEPR_WATCH_MODE = "true";
    namespaceClient.Get.mockResolvedValue({ metadata: { name: BLACKBOX_CONFIG_NAMESPACE } });
    secretClient.Get.mockResolvedValue(makeBlackboxSecret(BLACKBOX_BASE_CONFIG));

    await setupUptimeConfig();

    expect(namespaceClient.Apply).not.toHaveBeenCalled();
  });

  it("creates the namespace when it does not exist", async () => {
    process.env.PEPR_WATCH_MODE = "true";
    namespaceClient.Get.mockRejectedValue(new Error("not found"));
    secretClient.Get.mockResolvedValue(makeBlackboxSecret(BLACKBOX_BASE_CONFIG));

    await setupUptimeConfig();

    expect(namespaceClient.Apply).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { name: BLACKBOX_CONFIG_NAMESPACE } }),
    );
  });

  it("skips secret creation when it already exists", async () => {
    process.env.PEPR_WATCH_MODE = "true";
    namespaceClient.Get.mockResolvedValue({});
    secretClient.Get.mockResolvedValue(makeBlackboxSecret(BLACKBOX_BASE_CONFIG));

    await setupUptimeConfig();

    expect(secretClient.Apply).not.toHaveBeenCalled();
  });

  it("creates the secret with BLACKBOX_BASE_CONFIG when it does not exist", async () => {
    process.env.PEPR_WATCH_MODE = "true";
    namespaceClient.Get.mockResolvedValue({});
    secretClient.Get.mockRejectedValue(new Error("not found"));

    await setupUptimeConfig();

    const applyArg = secretClient.Apply.mock.calls[0][0];
    const applied = JSON.parse(atob(applyArg.data["blackbox.yaml"]));
    expect(applied).toEqual(BLACKBOX_BASE_CONFIG);
    expect(applyArg.metadata).toMatchObject({
      namespace: BLACKBOX_CONFIG_NAMESPACE,
      name: BLACKBOX_CONFIG_SECRET_NAME,
    });
  });
});
