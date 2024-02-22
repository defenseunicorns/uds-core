import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { buildChain } from "./authservice";
import { Client } from "./types";

describe("authservice", () => {
  let mockClient: Client;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      clientId: "test-client",
      redirectUris: ["https://demo.uds.dev/login"],
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
    const chain = buildChain(mockClient);
    expect(chain.name).toEqual(mockClient.clientId);
    expect(chain.filters.length).toEqual(1);

    expect(chain.filters[0].oidc_override.authorization_uri).toEqual(
      "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
    );

    expect(chain.filters[0].oidc_override.client_id).toEqual(mockClient.clientId);

    expect(chain.filters[0].oidc_override.client_secret).toEqual(mockClient.secret);

    expect(chain.filters[0].oidc_override.callback_uri).toEqual(mockClient.redirectUris[0]);
  });
});
