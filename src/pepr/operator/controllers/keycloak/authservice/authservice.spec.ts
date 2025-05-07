/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { UDSPackage } from "../../../crd";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import { buildChain, buildConfig } from "./authservice";
import * as mockConfig from "./mock-authservice-config.json";
import { Action, AuthServiceEvent, AuthserviceConfig } from "./types";

describe("authservice", () => {
  let mockClient: Client;

  beforeEach(() => {
    jest.clearAllMocks();

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
    let config1 = buildConfig(mockConfig as AuthserviceConfig, {
      client: mockClient,
      name: "local",
      action: Action.AddClient,
    });

    const trustedCA = "some-trusted-ca";
    config1 = buildConfig(config1, {
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
      await updatePolicy({ name: "auth-test", action: Action.AddClient }, labelSelector, pkg);
      await updatePolicy({ name: "auth-test", action: Action.RemoveClient }, labelSelector, pkg);
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
