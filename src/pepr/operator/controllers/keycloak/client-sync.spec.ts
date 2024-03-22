import { describe, expect, it } from "@jest/globals";
import { generateSecretData } from "./client-sync";
import { Client } from "./types";

const mockClient: Client = {
  alwaysDisplayInConsole: true,
  attributes: { first: "attribute" },
  authenticationFlowBindingOverrides: {},
  bearerOnly: true,
  clientAuthenticatorType: "",
  clientId: "testId",
  consentRequired: true,
  defaultClientScopes: [],
  defaultRoles: [],
  directAccessGrantsEnabled: true,
  enabled: true,
  frontchannelLogout: true,
  fullScopeAllowed: true,
  implicitFlowEnabled: true,
  nodeReRegistrationTimeout: 1,
  notBefore: 1,
  optionalClientScopes: [],
  protocol: "",
  publicClient: true,
  secret: "",
  redirectUris: ["https://demo.uds.dev/login"],
  registrationAccessToken: "",
  surrogateAuthRequired: true,
  serviceAccountsEnabled: true,
  webOrigins: [],
  standardFlowEnabled: true,
};

const mockClientStringified = {
  alwaysDisplayInConsole: "true",
  attributes: '{"first":"attribute"}',
  authenticationFlowBindingOverrides: "{}",
  bearerOnly: "true",
  clientAuthenticatorType: "",
  clientId: "testId",
  consentRequired: "true",
  defaultClientScopes: "[]",
  defaultRoles: "[]",
  directAccessGrantsEnabled: "true",
  enabled: "true",
  frontchannelLogout: "true",
  fullScopeAllowed: "true",
  implicitFlowEnabled: "true",
  nodeReRegistrationTimeout: "1",
  notBefore: "1",
  optionalClientScopes: "[]",
  protocol: "",
  publicClient: "true",
  secret: "",
  redirectUris: '["https://demo.uds.dev/login"]',
  registrationAccessToken: "",
  surrogateAuthRequired: "true",
  serviceAccountsEnabled: "true",
  webOrigins: "[]",
  standardFlowEnabled: "true",
};

describe("Test Secret & Template Data Generation", () => {
  it("generates data without template", async () => {
    expect(generateSecretData(mockClient)).toEqual(mockClientStringified);
  });

  it("generates data from template: no key or .json()", () => {
    const mockTemplate = {
      "auth.json": JSON.stringify({ client_id: "clientField(clientId)" }),
    };
    expect(generateSecretData(mockClient, mockTemplate)).toEqual({
      "auth.json": '{"client_id":"testId"}',
    });
  });

  it("generates data from template: has key", () => {
    const mockTemplate = {
      "auth.json": JSON.stringify({ redirect_uri: "clientField(redirectUris)[0]" }),
    };
    expect(generateSecretData(mockClient, mockTemplate)).toEqual({
      "auth.json": '{"redirect_uri":"https://demo.uds.dev/login"}',
    });
  });

  it("generates data from template: has .json()", () => {
    const mockTemplate = {
      "auth.json": JSON.stringify({ defaultScopes: "clientField(attributes).json()" }),
    };
    expect(generateSecretData(mockClient, mockTemplate)).toEqual({
      "auth.json": '{"defaultScopes":"{"first":"attribute"}"}',
    });
  });
});
