/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, MockedFunction, vi } from "vitest";
import { Sso, UDSPackage } from "../../crd";
import { syncClient } from "./client-sync";
import * as clientCredentials from "./clients/client-credentials";

// Mock the logger before importing the modules that use it
vi.mock("../../../logger", () => ({
  Component: {
    OPERATOR_KEYCLOAK: "OPERATOR_KEYCLOAK",
  },
  setupLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  convertSsoToClient,
  extractSamlCertificateFromXML,
  generateSecretData,
} from "./client-sync";
import { Client } from "./types";

// Mock the K8s Apply function
const mockApply = vi.fn().mockImplementation(resource => Promise.resolve(resource));

// Mock the pepr module
vi.mock("pepr", () => {
  return {
    K8s: () => ({
      Apply: mockApply,
    }),
    kind: {
      Secret: "Secret",
    },
  };
});

vi.mock("./clients/client-credentials", () => ({
  credentialsCreateOrUpdate: vi.fn(),
  credentialsDelete: vi.fn(),
}));

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
  name: "Test Client",
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

const mockClientStringified: Record<string, string> = {
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
  name: "Test Client",
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

describe("Test XML Extraction Using Regex", () => {
  it("extract xml", async () => {
    // Sample XML string with namespace prefixes
    const xmlString = `
    <md:EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://keycloak.admin.uds.dev/realms/uds">
        <md:IDPSSODescriptor WantAuthnRequestsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
            <md:KeyDescriptor use="signing">
                <ds:KeyInfo>
                    <ds:KeyName>SO1zm7gOpX2xlm16-pZ08zOJui0i7PwEHIqM6h4d9Sw</ds:KeyName>
                    <ds:X509Data>
                        <ds:X509Certificate>FOUND THE CERT</ds:X509Certificate>
                    </ds:X509Data>
                </ds:KeyInfo>
            </md:KeyDescriptor>
            <md:ArtifactResolutionService Binding="urn:oasis:names:tc:SAML:2.0:bindings:SOAP" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml/resolve" index="0"></md:ArtifactResolutionService>
            <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleLogoutService>
            <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleLogoutService>
            <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleLogoutService>
            <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:SOAP" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleLogoutService>
            <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
            <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</md:NameIDFormat>
            <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>
            <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
            <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleSignOnService>
            <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleSignOnService>
            <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:SOAP" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleSignOnService>
            <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleSignOnService>
        </md:IDPSSODescriptor>
    </md:EntityDescriptor>
    `;

    expect(extractSamlCertificateFromXML(xmlString)).toEqual("FOUND THE CERT");
  });
});

describe("Test Secret & Template Data Generation", () => {
  it("generates data without template", async () => {
    const expected: Record<string, string> = {};

    for (const key in mockClientStringified) {
      expected[key] = Buffer.from(mockClientStringified[key]).toString("base64");
    }
    expect(generateSecretData(mockClient)).toEqual(expected);
  });

  it("generates data from template: no key or .json()", () => {
    const mockTemplate = {
      "auth.json": JSON.stringify({ client_id: "clientField(clientId)" }),
    };
    expect(generateSecretData(mockClient, mockTemplate)).toEqual({
      "auth.json": Buffer.from('{"client_id":"testId"}').toString("base64"),
    });
  });

  it("generates data from template: has key", () => {
    const mockTemplate = {
      "auth.json": JSON.stringify({ redirect_uri: "clientField(redirectUris)[0]" }),
    };
    expect(generateSecretData(mockClient, mockTemplate)).toEqual({
      "auth.json": Buffer.from('{"redirect_uri":"https://demo.uds.dev/login"}').toString("base64"),
    });
  });

  it("generates data from template: has .json()", () => {
    const mockTemplate = {
      "auth.json": JSON.stringify({ defaultScopes: "clientField(attributes).json()" }),
    };
    expect(generateSecretData(mockClient, mockTemplate)).toEqual({
      "auth.json": Buffer.from('{"defaultScopes":"{"first":"attribute"}"}').toString("base64"),
    });
  });
});

describe("convertSsoToClient function", () => {
  it("should correctly convert a basic SSO object to a Client object", () => {
    const sso: Sso = {
      clientId: "test-client",
      name: "Test Client",
    };

    const expectedClient: Partial<Client> = {
      clientId: "test-client",
      name: "Test Client",
      attributes: { "uds.core.groups": "", "logout.confirmation.enabled": "true" },
    };

    expect(convertSsoToClient(sso)).toEqual(expectedClient);
  });

  it("should correctly convert a full SSO object to a Client object", () => {
    const sso: Sso = {
      alwaysDisplayInConsole: true,
      attributes: {
        "backchannel.logout.revoke.offline.tokens": "true",
      },
      clientId: "test-client",
      defaultClientScopes: ["scope1", "scope2"],
      description: "Test Description",
      enableAuthserviceSelector: { key: "value" },
      enabled: true,
      groups: { anyOf: ["group1"] },
      name: "Test Client",
      publicClient: true,
      redirectUris: ["https://example.com/callback"],
      rootUrl: "https://example.com",
      secret: "secret",
      secretConfig: {
        name: "secretName",
        template: { templateKey: "templateValue" },
      },
      standardFlowEnabled: true,
      webOrigins: ["https://example.com"],
    };

    const expectedClient: Partial<Client> = {
      clientId: "test-client",
      alwaysDisplayInConsole: true,
      attributes: {
        "backchannel.logout.revoke.offline.tokens": "true",
        "uds.core.groups": '{"anyOf":["group1"]}',
        "logout.confirmation.enabled": "true",
      },
      defaultClientScopes: ["scope1", "scope2"],
      enabled: true,
      name: "Test Client",
      publicClient: true,
      redirectUris: ["https://example.com/callback"],
      secret: "secret",
      standardFlowEnabled: true,
      webOrigins: ["https://example.com"],
    };

    expect(convertSsoToClient(sso)).toEqual(expectedClient);
  });

  it("should handle optional fields correctly", () => {
    const sso: Sso = {
      clientId: "test-client",
      name: "Test Client",
      groups: { anyOf: [] },
      enabled: undefined,
      protocol: undefined,
    };

    const expectedClient: Partial<Client> = {
      clientId: "test-client",
      name: "Test Client",
      attributes: { "uds.core.groups": '{"anyOf":[]}', "logout.confirmation.enabled": "true" },
      registrationAccessToken: undefined,
      samlIdpCertificate: undefined,
    };

    expect(convertSsoToClient(sso)).toEqual(expectedClient);
  });

  it("should handle empty fields correctly", () => {
    const sso: Sso = {
      clientId: "test-client",
      name: "Test Client",
      attributes: {},
    };

    const expectedClient: Partial<Client> = {
      clientId: "test-client",
      name: "Test Client",
      attributes: { "uds.core.groups": "", "logout.confirmation.enabled": "true" },
    };

    expect(convertSsoToClient(sso)).toEqual(expectedClient);
  });

  it("should handle multiple groups", () => {
    const sso: Sso = {
      alwaysDisplayInConsole: true,
      attributes: {
        "backchannel.logout.revoke.offline.tokens": "true",
      },
      clientId: "test-client",
      defaultClientScopes: ["scope1", "scope2"],
      description: "Test Description",
      enableAuthserviceSelector: { key: "value" },
      enabled: true,
      groups: { anyOf: ["group1", "group2"] },
      name: "Test Client",
      publicClient: true,
      redirectUris: ["https://example.com/callback"],
      rootUrl: "https://example.com",
      secret: "secret",
      secretConfig: {
        name: "secretName",
        template: { templateKey: "templateValue" },
      },
      standardFlowEnabled: true,
      webOrigins: ["https://example.com"],
    };

    const expectedClient: Partial<Client> = {
      clientId: "test-client",
      alwaysDisplayInConsole: true,
      attributes: {
        "backchannel.logout.revoke.offline.tokens": "true",
        "uds.core.groups": '{"anyOf":["group1","group2"]}',
        "logout.confirmation.enabled": "true",
      },
      defaultClientScopes: ["scope1", "scope2"],
      enabled: true,
      name: "Test Client",
      publicClient: true,
      redirectUris: ["https://example.com/callback"],
      secret: "secret",
      standardFlowEnabled: true,
      webOrigins: ["https://example.com"],
    };

    expect(convertSsoToClient(sso)).toEqual(expectedClient);
  });
});

// Test for the secretConfig preservation during retries
describe("syncClient secretConfig preservation", () => {
  // We'll use the mocks set up at the top of the file

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should preserve secretConfig.name when creating K8s secret", async () => {
    // Set up our test data
    const mockSso: Sso = {
      clientId: "test-client",
      name: "Test Client",
      secretConfig: {
        name: "custom-secret-name",
      },
      redirectUris: ["https://example.com"],
    };

    const mockPkg: UDSPackage = {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      metadata: {
        name: "test-package",
        namespace: "test-namespace",
        generation: 1,
      },
      spec: {},
    };

    // Mock successful client creation
    const mockCredentialsCreateOrUpdate =
      clientCredentials.credentialsCreateOrUpdate as MockedFunction<
        typeof clientCredentials.credentialsCreateOrUpdate
      >;
    // Create a minimal Client object with required fields
    mockCredentialsCreateOrUpdate.mockResolvedValueOnce({
      id: "test-id",
      clientId: "test-client",
      secret: "generated-secret",
    } as Client & { id: string });

    // Reset the mock apply function to track calls
    mockApply.mockClear();

    // Call the actual syncClient function
    await syncClient(mockSso, mockPkg);

    // Verify the K8s Apply was called with the correct secret name
    expect(mockApply).toHaveBeenCalled();
    // Use type assertion to fix TypeScript error
    const appliedResource = mockApply.mock.calls[0][0] as { metadata: { name: string } };
    expect(appliedResource.metadata.name).toBe("custom-secret-name");
  });

  it("should preserve secretConfig.name during retry", async () => {
    // Set up our test data
    const mockSso: Sso = {
      clientId: "test-client",
      name: "Test Client",
      secretConfig: {
        name: "custom-secret-name",
      },
      redirectUris: ["https://example.com"],
    };

    const mockPkg: UDSPackage = {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      metadata: {
        name: "test-package",
        namespace: "test-namespace",
        generation: 1,
      },
      spec: {},
    };

    // Mock credentialsCreateOrUpdate to fail on first call and succeed on second
    const mockCredentialsCreateOrUpdate =
      clientCredentials.credentialsCreateOrUpdate as MockedFunction<
        typeof clientCredentials.credentialsCreateOrUpdate
      >;
    mockCredentialsCreateOrUpdate.mockImplementationOnce(() => {
      throw new Error("Test error");
    });
    mockCredentialsCreateOrUpdate.mockImplementationOnce(() => {
      return Promise.resolve({
        id: "test-id",
        clientId: "test-client",
        secret: "generated-secret",
      } as Client & { id: string });
    });

    // Reset the mock apply function to track calls
    mockApply.mockClear();

    // Call the actual syncClient function
    await syncClient(mockSso, mockPkg);

    // Verify credentialsCreateOrUpdate was called twice (initial + retry)
    expect(mockCredentialsCreateOrUpdate).toHaveBeenCalledTimes(2);

    // Verify the K8s Apply was called with the correct secret name
    expect(mockApply).toHaveBeenCalled();
    // Use type assertion to fix TypeScript error
    const appliedResource = mockApply.mock.calls[0][0] as { metadata: { name: string } };
    expect(appliedResource.metadata.name).toBe("custom-secret-name");
  });
});
