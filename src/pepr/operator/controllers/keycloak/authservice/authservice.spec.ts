import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { buildChain, buildConfig } from "./authservice";
import { Client } from "../types";
import { Action, AuthServiceEvent, AuthserviceConfig } from "./types";
import * as mockConfig from "../mock-authservice-config.json";

describe("authservice", () => {
  let mockClient: Client;

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
});
