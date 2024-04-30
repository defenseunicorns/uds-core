import { describe, expect, it } from "@jest/globals";
import { extractSamlCertificateFromXML, generateSecretData } from "./client-sync";
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
