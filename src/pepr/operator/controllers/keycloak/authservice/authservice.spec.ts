import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Protocol, UDSPackage } from "../../../crd";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import { authservice, buildChain, buildConfig } from "./authservice";
import * as ConfigModule from "./config"; // Import the module where getAuthserviceConfig is defined
import {
  applyBatchedChecksumIfNeeded,
  getAuthserviceConfig,
  updateAuthServiceSecret,
} from "./config";
import * as mockConfig from "./mock-authservice-config.json";
import { Action, AuthServiceEvent, AuthserviceConfig } from "./types";

jest.mock("./config");

describe("authservice", () => {
  let mockClient: Client;
  let mockApplyBatchedChecksumIfNeeded: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      clientId: "test-client",
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

    // Mock the applyBatchedChecksumIfNeeded function to prevent actual execution
    mockApplyBatchedChecksumIfNeeded = applyBatchedChecksumIfNeeded as jest.Mock;

    // Mock getAuthserviceConfig to return a valid configuration
    const validConfig: AuthserviceConfig = {
      allow_unmatched_requests: false,
      listen_address: "0.0.0.0",
      listen_port: "10003",
      log_level: "info",
      default_oidc_config: {
        skip_verify_peer_cert: false,
        authorization_uri: "https://sso.example.com/realms/uds/protocol/openid-connect/auth",
        token_uri: "https://sso.example.com/realms/uds/protocol/openid-connect/token",
        jwks_fetcher: {
          jwks_uri: "https://sso.example.com/realms/uds/protocol/openid-connect/certs",
          periodic_fetch_interval_sec: 60,
        },
        client_id: "global_id",
        client_secret: "global_secret",
        id_token: {
          preamble: "Bearer",
          header: "Authorization",
        },
        trusted_certificate_authority: "some-cert",
        logout: {
          path: "/globallogout",
          redirect_uri: "https://sso.example.com/realms/uds/protocol/openid-connect/token/logout",
        },
        absolute_session_timeout: "0",
        idle_session_timeout: "0",
        scopes: [],
      },
      threads: 8,
      chains: [], // Ensure chains is initialized as an empty array
    };

    // Mock module method to return valid config
    jest.spyOn(ConfigModule, "getAuthserviceConfig").mockResolvedValue(validConfig);
  });

  test("should test authservice chain build", async () => {
    const chain = buildChain({
      client: mockClient,
      name: "sso-client-test",
      action: Action.Add,
    } as AuthServiceEvent);
    expect(chain.name).toEqual("sso-client-test");
    expect(chain.match.prefix).toEqual("foo.uds.dev");
    expect(chain.filters.length).toEqual(1);

    expect(chain.filters[0].oidc_override.authorization_uri).toEqual(
      "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
    );

    expect(chain.filters[0].oidc_override.client_id).toEqual(mockClient.clientId);
    expect(chain.filters[0].oidc_override.client_secret).toEqual(mockClient.secret);
    expect(chain.filters[0].oidc_override.callback_uri).toEqual(mockClient.redirectUris[0]);
  });

  test("should test authservice chain removal", async () => {
    const config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.Remove,
    });

    expect(config.chains.length).toEqual(0);
    expect(config.listen_address).toEqual("0.0.0.0");
  });

  test("should test authservice chain addition", async () => {
    let config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.Remove,
    });

    config = buildConfig(config, { client: mockClient, name: "sso-client-a", action: Action.Add });
    config = buildConfig(config, { client: mockClient, name: "sso-client-b", action: Action.Add });

    expect(config.chains.length).toEqual(2);
  });

  test("should test chain removal by name", async () => {
    let config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "nothere",
      action: Action.Remove,
    });
    expect(config.chains.length).toEqual(1);

    config = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.Remove,
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
      await updatePolicy({ name: "auth-test", action: Action.Add }, labelSelector, pkg);
      await updatePolicy({ name: "auth-test", action: Action.Remove }, labelSelector, pkg);
    } catch (e) {
      expect(e).toBeUndefined();
    }
  });

  test("should update config without applying checksum immediately", async () => {
    const mockUpdateAuthServiceSecret = updateAuthServiceSecret as jest.MockedFunction<
      typeof updateAuthServiceSecret
    >;
    mockUpdateAuthServiceSecret.mockResolvedValueOnce();

    const config = await getAuthserviceConfig();
    jest.spyOn(ConfigModule, "getAuthserviceConfig").mockResolvedValue(config);

    await updateAuthServiceSecret(config, false);

    expect(mockUpdateAuthServiceSecret).toHaveBeenCalledWith(config, false);
    expect(mockApplyBatchedChecksumIfNeeded).not.toHaveBeenCalled();
  });

  test("should apply batched checksum after processing all changes", async () => {
    const pkg: UDSPackage = {
      kind: "Package",
      apiVersion: "uds.dev/v1alpha1",
      metadata: {
        name: "test",
        namespace: "default",
        generation: 1,
        uid: "f50120aa-2713-4502-9496-566b102b1174",
      },
      spec: {
        sso: [
          {
            clientId: "test-client",
            enableAuthserviceSelector: { someKey: "someValue" },
            name: "Test SSO Client",
            protocol: Protocol.OpenidConnect,
            enabled: true,
          },
        ],
      },
      status: {
        authserviceClients: ["test-client"],
      },
    };

    const clients = new Map<string, Client>();
    clients.set(mockClient.clientId, mockClient);

    await authservice(pkg, clients);

    // Ensure that batched checksum is applied after processing changes
    expect(mockApplyBatchedChecksumIfNeeded).toHaveBeenCalled();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
