/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, MockedFunction, vi } from "vitest";
import { Protocol, Sso, UDSPackage } from "../../crd";
import { syncClient } from "./client-sync";
import * as clientCredentials from "./clients/client-credentials";

// Shared spy used inside the hoisted vi.mock factory for pepr's fetch. vi.hoisted
// ensures it is initialized before the (also hoisted) mock factory runs.
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

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
  getSamlCertificate,
} from "./client-sync";
import { Client } from "./types";

// Mock the K8s Apply function
const mockApply = vi.fn().mockImplementation(resource => Promise.resolve(resource));

// Mock the pepr module
vi.mock("pepr", () => {
  return {
    fetch: (...args: unknown[]) => mockFetch(...args),
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

// Builds a SAML IdP descriptor modeled on a real Keycloak descriptor: the
// KeyDescriptors use the `ds:` prefix and elements use the `md:` prefix, as
// Keycloak does. `signingKeys` describes the signing KeyDescriptors in the order
// Keycloak would emit them (active key first).
function buildDescriptor({
  signingKeys = [],
  encryptionCert,
}: {
  signingKeys?: { keyName?: string; cert?: string }[];
  encryptionCert?: string;
}) {
  const keyDescriptors = signingKeys
    .map(
      k => `
      <md:KeyDescriptor use="signing">
        <ds:KeyInfo>
          ${k.keyName !== undefined ? `<ds:KeyName>${k.keyName}</ds:KeyName>` : ""}
          <ds:X509Data>
            ${k.cert !== undefined ? `<ds:X509Certificate>${k.cert}</ds:X509Certificate>` : ""}
          </ds:X509Data>
        </ds:KeyInfo>
      </md:KeyDescriptor>`,
    )
    .join("");

  const encryptionDescriptor =
    encryptionCert !== undefined
      ? `
      <md:KeyDescriptor use="encryption">
        <ds:KeyInfo>
          <ds:X509Data>
            <ds:X509Certificate>${encryptionCert}</ds:X509Certificate>
          </ds:X509Data>
        </ds:KeyInfo>
      </md:KeyDescriptor>`
      : "";

  const idpDescriptor = `
    <md:IDPSSODescriptor WantAuthnRequestsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">${keyDescriptors}${encryptionDescriptor}
      <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://keycloak.admin.uds.dev/realms/uds/protocol/saml"></md:SingleSignOnService>
    </md:IDPSSODescriptor>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://keycloak.admin.uds.dev/realms/uds">${idpDescriptor}
</md:EntityDescriptor>`;
}

describe("extractSamlCertificateFromXML", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the certificate for a single signing KeyDescriptor", () => {
    const xml = buildDescriptor({
      signingKeys: [{ keyName: "KEY-1", cert: "CERT-ONE" }],
    });
    expect(extractSamlCertificateFromXML(xml)).toEqual("CERT-ONE");
  });

  it("returns the first signing cert (the active key) when multiple are present", () => {
    // Regression for the original bug: a greedy match ran the two certificates
    // together. Keycloak sorts signing keys active-first, so the first is correct.
    const xml = buildDescriptor({
      signingKeys: [
        { keyName: "KEY-1", cert: "CERT-ONE" },
        { keyName: "KEY-2", cert: "CERT-TWO" },
      ],
    });
    const result = extractSamlCertificateFromXML(xml);
    expect(result).toEqual("CERT-ONE");
    // No XML fragments leak into the extracted certificate
    expect(result).not.toContain("<");
    expect(result).not.toContain("KeyDescriptor");
  });

  it("ignores encryption KeyDescriptors", () => {
    const xml = buildDescriptor({
      signingKeys: [{ keyName: "KEY-1", cert: "SIGNING-CERT" }],
      encryptionCert: "ENCRYPTION-CERT",
    });
    expect(extractSamlCertificateFromXML(xml)).toEqual("SIGNING-CERT");
  });

  it("strips whitespace and line breaks from the certificate", () => {
    const xml = buildDescriptor({
      signingKeys: [{ keyName: "KEY-1", cert: "CERT\n  WITH\n  BREAKS" }],
    });
    expect(extractSamlCertificateFromXML(xml)).toEqual("CERTWITHBREAKS");
  });

  it("throws when there is no signing X509Certificate", () => {
    const xml = buildDescriptor({
      signingKeys: [{ keyName: "KEY-1" }],
    });
    expect(() => extractSamlCertificateFromXML(xml)).toThrow(/no signing X509Certificate/);
  });

  // Real-shape descriptor: exercises the extraction against a full Keycloak SAML
  // IdP descriptor captured during a signing-key rotation (two signing keys, a
  // signed descriptor, and the usual service endpoints).
  it("extracts the active signing cert from a real rotation descriptor fixture", () => {
    const xml = readFileSync(join(__dirname, "testdata", "saml-descriptor-rotation.xml"), "utf-8");

    const result = extractSamlCertificateFromXML(xml);

    // No XML fragments leaked into the certificate (the original bug)
    expect(result).not.toContain("<");
    expect(result).not.toContain("KeyDescriptor");

    // The result is a single, valid X509 certificate, and it is the descriptor's
    // active signing key (the first signing KeyDescriptor, which Keycloak sorts
    // active-key first) rather than the previous, still-advertised key.
    const cert = new X509Certificate(Buffer.from(result, "base64"));
    expect(cert.subject).toContain("uds-realm-key-1");
    expect(cert.subject).not.toContain("uds-realm-key-2");
  });
});

describe("getSamlCertificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the descriptor fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" });
    await expect(getSamlCertificate()).rejects.toThrow(/503, Service Unavailable/);
  });

  it("returns the extracted certificate on a successful fetch", async () => {
    const xml = buildDescriptor({
      signingKeys: [{ keyName: "KEY-1", cert: "FETCHED-CERT" }],
    });
    mockFetch.mockResolvedValueOnce({ ok: true, data: xml });
    await expect(getSamlCertificate()).resolves.toEqual("FETCHED-CERT");
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

describe("syncClient SAML certificate handling", () => {
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

  const mockSamlSso: Sso = {
    clientId: "test-client",
    name: "Test Client",
    protocol: Protocol.Saml,
  };

  const descriptorXml = buildDescriptor({
    signingKeys: [{ keyName: "KEY-1", cert: "SAML-SIGNING-CERT" }],
  });

  let mockCredentialsCreateOrUpdate: MockedFunction<
    typeof clientCredentials.credentialsCreateOrUpdate
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCredentialsCreateOrUpdate = clientCredentials.credentialsCreateOrUpdate as MockedFunction<
      typeof clientCredentials.credentialsCreateOrUpdate
    >;
    mockCredentialsCreateOrUpdate.mockResolvedValue({
      id: "test-id",
      clientId: "test-client",
      protocol: "saml",
      secret: "generated-secret",
    } as Client & { id: string });
  });

  it("stores the fetched SAML IdP certificate in the secret", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, data: descriptorXml });

    await syncClient(mockSamlSso, mockPkg);

    const appliedResource = mockApply.mock.calls[0][0] as { data: Record<string, string> };
    expect(Buffer.from(appliedResource.data.samlIdpCertificate, "base64").toString()).toBe(
      "SAML-SIGNING-CERT",
    );
  });

  it("retries the descriptor fetch once on a transient failure", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, data: descriptorXml });

    await syncClient(mockSamlSso, mockPkg);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const appliedResource = mockApply.mock.calls[0][0] as { data: Record<string, string> };
    expect(Buffer.from(appliedResource.data.samlIdpCertificate, "base64").toString()).toBe(
      "SAML-SIGNING-CERT",
    );
  });

  it("fails with client and package context when the descriptor fetch keeps failing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" });

    await expect(syncClient(mockSamlSso, mockPkg)).rejects.toThrow(
      /Failed to get SAML IdP certificate for client 'test-client', package test-namespace\/test-package/,
    );
    // Initial attempt plus one retry
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
