/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, test, vi } from "vitest";

// Mock buildCABundleContent first
vi.mock("../../ca-bundles/ca-bundle", () => ({
  buildCABundleContent: vi.fn(),
}));

import { Sso, UDSPackage } from "../../../crd";
import { AuthserviceClient, Mode } from "../../../crd/generated/package-v1alpha1";
import { buildCABundleContent } from "../../ca-bundles/ca-bundle";
import { cleanupWaypointLabels } from "../../istio/ambient-waypoint";
import { getWaypointName } from "../../istio/waypoint-utils";
import { Client } from "../types";
import * as authorizationPolicy from "./authorization-policy";
import { authservice, buildChain, buildConfig } from "./authservice";
import * as configModule from "./config";
import * as mockConfig from "./mock-authservice-config.json";
import { Action, AuthserviceConfig, AuthServiceEvent } from "./types";
const mockBuildCABundleContent = vi.mocked(buildCABundleContent);

// Mock the waypoint utilities
vi.mock("../../istio/waypoint-utils", () => ({
  getWaypointName: vi.fn().mockImplementation((id: string) => `${id}-waypoint`),
}));

// Mock the ambient-waypoint module
vi.mock("../../istio/ambient-waypoint", () => ({
  cleanupWaypointLabels: vi.fn().mockResolvedValue(undefined),
  setupAmbientWaypoint: vi.fn().mockResolvedValue(undefined),
}));

// --- Pepr K8s and R utility mock ---
const mockGet = vi.fn();
const mockUpdate = vi.fn();
const mockApply = vi.fn();
const mockList = vi.fn();

vi.mock("pepr", async () => {
  const actual = await vi.importActual<typeof import("pepr")>("pepr");
  return {
    ...actual,
    K8s: () =>
      Object.assign({
        Get: mockGet,
        Update: mockUpdate,
        Apply: mockApply,
        List: mockList,
        // Add more methods if needed
        InNamespace: vi.fn().mockImplementation(() => ({
          WithLabel: vi.fn().mockReturnThis(),
          Delete: vi.fn().mockResolvedValue(undefined),
          Get: vi.fn().mockResolvedValue({ items: [] }),
          // Add other chainable/query methods as needed
        })),
      }),
    kind: {
      Secret: "Secret",
      // Add more kinds if needed
    },
    Log: {
      child: vi.fn().mockReturnValue({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    },
  };
});

// Mock dependencies
vi.mock("../../istio/ambient-waypoint", () => ({
  setupAmbientWaypoint: vi.fn().mockResolvedValue(undefined),
  cleanupWaypointLabels: vi.fn().mockResolvedValue(undefined),
}));

// Mock the config module
vi.mock("./config", () => {
  const mockAuthserviceConfig = {
    listen_address: "0.0.0.0",
    listen_port: "8080",
    log_level: "info",
    threads: 4,
    allow_unmatched_requests: true,
    default_oidc_config: {
      authorization_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
      token_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token",
      callback_uri: "https://authservice.test-ns.svc.cluster.local/oauth2/callback",
      client_id: "authservice",
      client_secret: "test-secret",
      scopes: ["openid", "profile", "email"],
      logout: {
        path: "/oauth2/sign_out",
        redirect_uri: "https://authservice.test-ns.svc.cluster.local/oauth2/sign_out",
      },
    },
    chains: [],
  };

  return {
    initializeOperatorConfig: vi.fn().mockResolvedValue(undefined),
    getAuthserviceConfig: vi.fn().mockResolvedValue(mockAuthserviceConfig),
    setAuthserviceConfig: vi.fn().mockResolvedValue(undefined),
    updateAuthServiceSecret: vi.fn().mockResolvedValue(undefined),
    operatorConfig: {
      secretName: "authservice-secret",
      namespace: "test-ns",
      realm: "uds",
      domain: "uds.dev",
    },
  };
});

// Mock UDSConfig for domain
vi.mock("../../config/config", () => ({
  UDSConfig: {
    domain: "uds.dev",
  },
}));

// Mock the authorization-policy module
vi.mock("./authorization-policy", () => ({
  updatePolicy: vi.fn().mockResolvedValue(undefined),
  UDSConfig: {
    domain: "uds.dev",
  },
}));

// Test helpers
function createMockPackage(
  name: string,
  labels: Record<string, string> = {},
  ssoConfig: Sso[] = [],
): UDSPackage {
  return {
    apiVersion: "uds.dev/v1alpha1",
    kind: "Package",
    metadata: {
      name,
      namespace: "test-ns",
      labels,
    },
    spec: {
      sso: ssoConfig,
    },
    status: {
      conditions: [],
      authserviceClients: [],
    },
  };
}

describe("purgeAuthserviceClients", () => {
  // Move the common mocks to the top level
  const mockSecretResponse = {
    metadata: {
      name: "authservice-secret",
      namespace: "test-ns",
    },
    data: {
      "config.json": Buffer.from(
        JSON.stringify({
          listen_address: "0.0.0.0",
          default_oidc_config: {},
        }),
      ).toString("base64"),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockSecretResponse);
    mockUpdate.mockResolvedValue({});
  });

  it("should handle selector changes for existing clients", async () => {
    // Arrange
    const pkg = createMockPackage("test-pkg");
    const originalClient: AuthserviceClient = {
      clientId: "test-client",
      selector: { "app.kubernetes.io/name": "old-selector" },
    };
    const updatedClient: AuthserviceClient = {
      clientId: "test-client",
      selector: { "app.kubernetes.io/name": "new-selector" },
    };

    pkg.status = {
      ...pkg.status,
      authserviceClients: [originalClient],
    };

    // Set up the mock response for this test
    mockGet.mockResolvedValueOnce(mockSecretResponse);

    // Act
    const { purgeAuthserviceClients } = await import("./authservice.js");
    await purgeAuthserviceClients(pkg, [updatedClient], Mode.Ambient, Mode.Ambient);

    // Assert
    expect(getWaypointName).toHaveBeenCalledWith("test-client");
    expect(cleanupWaypointLabels).toHaveBeenCalledWith("test-ns", "test-client-waypoint");
    expect(pkg.status?.authserviceClients).toHaveLength(1);
  });

  it("should handle empty initial clients list", async () => {
    // Arrange
    const pkg = createMockPackage("test-pkg");
    const newClient: AuthserviceClient = {
      clientId: "new-client",
      selector: { app: "test" },
    };

    // Act
    const { purgeAuthserviceClients } = await import("./authservice.js");
    await purgeAuthserviceClients(pkg, [newClient], Mode.Ambient, Mode.Ambient);

    // Assert
    const { cleanupWaypointLabels } = await import("../../istio/ambient-waypoint.js");
    expect(cleanupWaypointLabels).not.toHaveBeenCalled();
    expect(pkg.status?.authserviceClients).toHaveLength(0);
  });
});

describe("authservice", () => {
  const mockClient = {
    clientId: "test-client",
    clientSecret: "test-secret",
    redirectUris: ["http://test.com/callback"],
    webOrigins: ["http://test.com"],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the updatePolicy function
    vi.spyOn(authorizationPolicy, "updatePolicy").mockResolvedValue(undefined);

    // Setup default mocks
    mockGet.mockImplementation((opts: { name: string; namespace: string }) => {
      if (opts.name === "authservice-secret") {
        return Promise.resolve({
          metadata: {
            name: "authservice-secret",
            namespace: "test-ns",
          },
          data: {
            "config.json": Buffer.from(
              JSON.stringify({
                listen_address: "0.0.0.0",
                default_oidc_config: {},
                chains: [],
                filters: [],
              }),
            ).toString("base64"),
          },
        });
      }
      return Promise.reject({ status: 404 });
    });

    mockUpdate.mockResolvedValue({});
    mockApply.mockResolvedValue({});
    mockList.mockResolvedValue({ items: [] });
  });

  it("should process a package with a single SSO configuration", async () => {
    // Arrange
    const pkg = {
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {
        sso: [
          {
            name: "test-sso",
            clientId: "test-client",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      },
      status: {},
    } as unknown as UDSPackage;

    const clients = new Map();
    clients.set("test-client", mockClient);

    // Mock the required Kubernetes API responses
    mockGet.mockResolvedValueOnce({
      metadata: {
        name: "authservice-secret",
        namespace: "test-ns",
      },
      data: {
        "config.json": Buffer.from(
          JSON.stringify({
            listen_address: "0.0.0.0",
            default_oidc_config: {},
            chains: [],
            filters: [],
          }),
        ).toString("base64"),
      },
    });

    // Act
    const result = await authservice(pkg, clients);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      clientId: "test-client",
      selector: { "app.kubernetes.io/name": "test-app" },
    });
  });
});

describe("authservice", () => {
  let mockClient: Client;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockClient = {
      clientId: "test-client",
      name: "test",
      redirectUris: ["https://foo.uds.dev/login"],
      secret: "test-secret",
      alwaysDisplayInConsole: false,
      attributes: {},
      authenticationFlowBindingOverrides: {},
      bearerOnly: false,
      clientAuthenticatorType: "client-secret",
      consentRequired: false,
      defaultClientScopes: [],
      defaultRoles: [],
      directAccessGrantsEnabled: false,
      enabled: true,
      frontchannelLogout: false,
      fullScopeAllowed: false,
      implicitFlowEnabled: false,
      nodeReRegistrationTimeout: 0,
      notBefore: 0,
      optionalClientScopes: [],
      protocol: "openid-connect",
      publicClient: false,
      serviceAccountsEnabled: false,
      standardFlowEnabled: false,
      surrogateAuthRequired: false,
      webOrigins: [],
    };

    // Setup mock config values
    vi.mocked(configModule.operatorConfig).secretName = "authservice-secret";
    vi.mocked(configModule.operatorConfig).namespace = "test-ns";

    // Mock the config functions with proper AuthserviceConfig
    vi.mocked(configModule.getAuthserviceConfig).mockResolvedValue({
      listen_address: "0.0.0.0",
      listen_port: "8080",
      log_level: "info",
      threads: 4,
      allow_unmatched_requests: true,
      default_oidc_config: {
        authorization_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
        token_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token",
        callback_uri: "https://authservice.test-ns.svc.cluster.local/oauth2/callback",
        client_id: "authservice",
        client_secret: "test-secret",
        scopes: ["openid", "profile", "email"],
        logout: {
          path: "/oauth2/sign_out",
          redirect_uri: "https://authservice.test-ns.svc.cluster.local/oauth2/sign_out",
        },
      },
      chains: [],
    });

    // Initialize the operator config
    await configModule.initializeOperatorConfig();
  });

  test("should update redis session store config to add value", async () => {
    let config1 = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.AddClient,
    });

    const redisUri = "redis://localhost:6379";
    config1 = buildConfig(config1, {
      name: "redis-update",
      action: Action.UpdateGlobalConfig,
      redisUri: redisUri,
    });

    expect(config1.default_oidc_config.redis_session_store_config).toBeDefined();
    expect(config1.default_oidc_config.redis_session_store_config?.server_uri).toEqual(redisUri);
  });

  test("should update redis session store config to remove redis uri", async () => {
    const redisUri = "redis://localhost:6379";
    const config1 = buildConfig(mockConfig as AuthserviceConfig, {
      name: "redis-update",
      action: Action.UpdateGlobalConfig,
      redisUri: redisUri,
    });

    // Test removal with an undefined redis uri
    const config2 = buildConfig(config1, {
      name: "redis-update",
      action: Action.UpdateGlobalConfig,
    });

    expect(config2.default_oidc_config.redis_session_store_config).toBeUndefined();

    // Test removal with an empty redis uri
    const config3 = buildConfig(config1, {
      name: "redis-update",
      action: Action.UpdateGlobalConfig,
      redisUri: "",
    });

    expect(config3.default_oidc_config.redis_session_store_config).toBeUndefined();
  });

  test("should update trusted certificate authority to add value", async () => {
    // Mock buildCABundleContent to return empty string so inline trust is used
    mockBuildCABundleContent.mockReturnValue("");

    const trustedCA = "some-trusted-ca";
    const config1 = buildConfig(mockConfig as AuthserviceConfig, {
      name: "trusted-ca-update",
      action: Action.UpdateGlobalConfig,
      trustedCA: trustedCA,
    });

    expect(config1.default_oidc_config.trusted_certificate_authority).toBeDefined();
    expect(config1.default_oidc_config.trusted_certificate_authority).toEqual(trustedCA);
  });

  test("should update trusted certificate authority to remove value", async () => {
    const trustedCA = "some-trusted-ca";
    const config1 = buildConfig(mockConfig as AuthserviceConfig, {
      name: "trusted-ca-update",
      action: Action.UpdateGlobalConfig,
      trustedCA: trustedCA,
    });

    // Test removal with an undefined ca
    const config2 = buildConfig(config1, {
      name: "trusted-ca-update",
      action: Action.UpdateGlobalConfig,
    });

    expect(config2.default_oidc_config.trusted_certificate_authority).toBeUndefined();

    // Test removal with an undefined ca
    const config3 = buildConfig(config1, {
      name: "trusted-ca-update",
      action: Action.UpdateGlobalConfig,
      trustedCA: "",
    });

    expect(config3.default_oidc_config.trusted_certificate_authority).toBeUndefined();
  });

  test("should test authservice chain build", async () => {
    const chain = buildChain({
      client: mockClient,
      name: "sso-client-test",
      action: Action.AddClient,
    } as unknown as AuthServiceEvent);

    expect(chain.name).toEqual("sso-client-test");
    expect(chain.match.prefix).toEqual("foo.uds.dev");
    expect(chain.filters).toHaveLength(1);

    expect(chain.filters[0].oidc_override).toBeDefined();

    if (chain.filters[0].oidc_override) {
      expect(chain.filters[0].oidc_override.authorization_uri).toEqual(
        "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
      );
      expect(chain.filters[0].oidc_override.client_id).toEqual(mockClient.clientId);
      expect(chain.filters[0].oidc_override.client_secret).toEqual(mockClient.secret);
      const expectedCallbackUri = `https://foo.uds.dev/.uds/auth/callback/${Buffer.from(mockClient.clientId).toString("base64url").substring(0, 8)}`;
      expect(chain.filters[0].oidc_override.callback_uri).toEqual(expectedCallbackUri);
    }
  });

  test("should test authservice chain removal", async () => {
    const config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.RemoveClient,
    });

    expect(config.chains.length).toEqual(0);
    expect(config.listen_address).toEqual("0.0.0.0");
  });

  test("should test authservice chain addition", async () => {
    let config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.RemoveClient,
    });

    config = buildConfig(config, {
      client: mockClient,
      name: "sso-client-a",
      action: Action.AddClient,
    });
    config = buildConfig(config, {
      client: mockClient,
      name: "sso-client-b",
      action: Action.AddClient,
    });

    expect(config.chains.length).toEqual(2);
  });

  test("should test chain removal by name", async () => {
    let config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "nothere",
      action: Action.RemoveClient,
    });
    expect(config.chains.length).toEqual(1);

    config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.RemoveClient,
    });
    expect(config.chains.length).toEqual(0);
  });

  test("should build an authorization policy", async () => {
    const labelSelector = { foo: "bar" };
    const pkg: UDSPackage = {
      kind: "Package",
      apiVersion: "uds.dev/v1alpha1",
      metadata: {
        name: "test",
        namespace: "default",
        generation: 1,
        uid: "f50120aa-2713-4502-9496-566b102b1174",
      },
    };
    try {
      await authorizationPolicy.updatePolicy(
        { name: "auth-test", action: Action.AddClient },
        labelSelector,
        pkg,
        false,
      );
      await authorizationPolicy.updatePolicy(
        { name: "auth-test", action: Action.RemoveClient },
        labelSelector,
        pkg,
        false,
      );
    } catch (e) {
      expect(e).toBeUndefined();
    }
  });

  test("should add multiple chains to authservice", async () => {
    let config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.AddClient,
    });

    config = buildConfig(config, {
      client: mockClient,
      name: "some-other-name",
      action: Action.AddClient,
    });
    config = buildConfig(config, {
      client: mockClient,
      name: "some-second-name",
      action: Action.AddClient,
    });
    config = buildConfig(config, {
      client: mockClient,
      name: "some-third-name",
      action: Action.AddClient,
    });

    expect(config.chains.length).toEqual(4);
  });

  test("should add multiple chains to authservice and be sorted", async () => {
    let config1 = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.RemoveClient,
    });

    // after sorting, the order should be like so:
    // const unsortedNames = [
    //   "first-name"
    //   "some-fifth-name",
    //   "some-other-name",
    //   "some-second-name",
    //   "some-third-name",
    // ]

    const unsortedNames = [
      "some-other-name",
      "first-name",
      "some-third-name",
      "some-second-name",
      "some-fifth-name",
    ];
    shuffleArray(unsortedNames);
    unsortedNames.map(val => {
      config1 = buildConfig(config1, {
        client: mockClient,
        name: val,
        action: Action.AddClient,
      });
    });

    expect(config1.chains.length).toEqual(5);
    expect(config1.chains[0].name).toEqual("first-name");
  });

  test("should add multiple chains to authservice and be sorted, with removals", async () => {
    let config1 = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.RemoveClient,
    });

    const unsortedNames = [
      "some-other-name",
      "first-name",
      "some-second-name",
      "some-third-name",
      "some-fifth-name",
    ];
    shuffleArray(unsortedNames);
    unsortedNames.map(val => {
      config1 = buildConfig(config1, {
        client: mockClient,
        name: val,
        action: Action.AddClient,
      });
    });

    expect(config1.chains.length).toEqual(5);
    expect(config1.chains[0].name).toEqual("first-name");
    expect(config1.chains[4].name).toEqual("some-third-name");

    config1 = buildConfig(config1, {
      client: mockClient,
      name: "some-third-name",
      action: Action.RemoveClient,
    });

    expect(config1.chains.length).toEqual(4);
    expect(config1.chains[0].name).toEqual("first-name");
    expect(config1.chains[3].name).toEqual("some-second-name");

    config1 = buildConfig(config1, {
      client: mockClient,
      name: "some-fifth-name",
      action: Action.RemoveClient,
    });

    expect(config1.chains.length).toEqual(3);
    expect(config1.chains[0].name).toEqual("first-name");
    expect(config1.chains[2].name).toEqual("some-second-name");

    config1 = buildConfig(config1, {
      client: mockClient,
      name: "aaaa-final",
      action: Action.AddClient,
    });
    expect(config1.chains.length).toEqual(4);
    expect(config1.chains[0].name).toEqual("aaaa-final");

    config1 = buildConfig(config1, {
      client: mockClient,
      name: "1-something",
      action: Action.AddClient,
    });

    config1 = buildConfig(config1, {
      client: mockClient,
      name: "10-something",
      action: Action.AddClient,
    });

    config1 = buildConfig(config1, {
      client: mockClient,
      name: "2-something",
      action: Action.AddClient,
    });
    expect(config1.chains.length).toEqual(7);
    expect(config1.chains[0].name).toEqual("1-something");
    expect(config1.chains[1].name).toEqual("10-something");
    expect(config1.chains[2].name).toEqual("2-something");
  });
});

/**
 * Randomize array in-place using Durstenfeld shuffle algorithm
 * ripped this from some source on the internet
 * */
function shuffleArray(array: string[]) {
  for (let i = array.length - 1; i >= 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}
