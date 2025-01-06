/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { PeprValidateRequest } from "pepr";
import { Allow, Direction, Expose, Gateway, Protocol, RemoteGenerated, Sso, UDSPackage } from "..";
import { validator } from "./package-validator";

const makeMockReq = (
  pkg: Partial<UDSPackage>,
  exposeList: Partial<Expose>[],
  allowList: Partial<Allow>[],
  ssoClients: Partial<Sso>[],
) => {
  const defaultPkg: UDSPackage = {
    metadata: {
      namespace: "application-system",
      name: "application",
    },
    spec: {
      network: {
        expose: [],
        allow: [],
      },
      sso: [],
    },
  };

  for (const expose of exposeList) {
    const defaultExpose: Expose = {
      host: "app",
    };
    defaultPkg.spec!.network!.expose?.push({ ...defaultExpose, ...expose });
  }

  for (const allow of allowList) {
    const defaultAllow: Allow = {
      direction: Direction.Egress,
    };
    defaultPkg.spec!.network!.allow?.push({ ...defaultAllow, ...allow });
  }

  for (const client of ssoClients) {
    const defaultClient: Sso = {
      name: "Application Login",
      clientId: "uds-package-application",
      redirectUris: ["https://app.uds.dev/redirect"],
    };
    defaultPkg.spec!.sso?.push({ ...defaultClient, ...client });
  }

  return {
    Raw: { ...defaultPkg, ...pkg },
    Approve: jest.fn(),
    Deny: jest.fn(),
  } as unknown as PeprValidateRequest<UDSPackage>;
};

describe("Test validation of Exemption CRs", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("allows packages that have no issues", async () => {
    const mockReq = makeMockReq({}, [{}], [{}], [{}]);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies system namespaces", async () => {
    const mockReq = makeMockReq({ metadata: { namespace: "kube-system" } }, [], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies advancedHTTP when used with passthrough Gateways", async () => {
    const mockReq = makeMockReq(
      {},
      [
        {
          gateway: Gateway.Passthrough,
          advancedHTTP: {
            directResponse: { status: 403 },
          },
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies advancedHTTP.directResponse when used with a selector", async () => {
    const mockReq = makeMockReq(
      {},
      [
        {
          advancedHTTP: {
            directResponse: { status: 403 },
          },
          selector: { app: "app" },
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies advancedHTTP.directResponse when used with a service", async () => {
    const mockReq = makeMockReq(
      {},
      [
        {
          advancedHTTP: {
            directResponse: { status: 403 },
          },
          service: "app-service",
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies advancedHTTP.directResponse when used with a port", async () => {
    const mockReq = makeMockReq(
      {},
      [
        {
          advancedHTTP: {
            directResponse: { status: 403 },
          },
          port: 443,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies advancedHTTP.directResponse when used with a targetPort", async () => {
    const mockReq = makeMockReq(
      {},
      [
        {
          advancedHTTP: {
            directResponse: { status: 403 },
          },
          port: 8443,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies virtual services that are the same name", async () => {
    const mockReq = makeMockReq({}, [{}, {}], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify both remoteGenerated and remoteNamespace", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteGenerated: RemoteGenerated.Anywhere,
          remoteNamespace: "other-system",
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify both remoteGenerated and remoteSelector", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteGenerated: RemoteGenerated.Anywhere,
          remoteSelector: { app: "other" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that are the same name", async () => {
    const mockReq = makeMockReq({}, [], [{}, {}], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies clients with clientIDs that are not unique", async () => {
    const mockReq = makeMockReq({}, [], [], [{}, {}]);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies clients with invalid secret names", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          secretName: "HELLO_KITTEH",
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies clients with using the standard flow that don't have redirectUris", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          redirectUris: undefined,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows clients not using the standard flow that don't have redirectUris", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          standardFlowEnabled: false,
          redirectUris: undefined,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using the standard flow", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: true,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public clients using the service accounts roles", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          serviceAccountsEnabled: true,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies using standard flow with service accounts roles", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          standardFlowEnabled: true,
          serviceAccountsEnabled: true,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using a secret", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          secret: "app-client-secret",
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using a secretName", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          secretName: "app-k8s-secret",
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using a secretTemplate", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          secretTemplate: {},
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using enableAuthserviceSelector", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          enableAuthserviceSelector: {},
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using the saml protocol", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          protocol: Protocol.Saml,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public clients without the device flow attribute", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: false,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows public clients that have the device flow attribute with standard flow disabled", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows service account clients with standard flow disabled ", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          serviceAccountsEnabled: true,
          standardFlowEnabled: false,
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies authservice clients with : in client ID", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "http://example.com",
          enableAuthserviceSelector: {
            app: "foobar",
          },
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows non-authservice clients with : in client ID", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "http://example.com",
          enableAuthserviceSelector: undefined, // explicitly undefined
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });
});

describe("Test Allowed SSO Client Attributes", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("denies clients with unsupported attributes", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          attributes: {
            "unsupported.attribute": "true",
          },
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "uds-package-application" contains an unsupported attribute "unsupported.attribute"',
    );
  });

  it("allows clients with only supported attributes", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          attributes: {
            "oidc.ciba.grant.enabled": "true",
            "backchannel.logout.session.required": "false",
            "backchannel.logout.revoke.offline.tokens": "true",
            "post.logout.redirect.uris": "https://app.uds.dev/logout",
            "oauth2.device.authorization.grant.enabled": "true",
            "pkce.code.challenge.method": "S256",
            "client.session.idle.timeout": "3600",
            "client.session.max.lifespan": "36000",
            "access.token.lifespan": "60",
            "saml.assertion.signature": "false",
            "saml.client.signature": "false",
            saml_assertion_consumer_url_post: "https://nexus.uds.dev/saml",
            saml_assertion_consumer_url_redirect: "https://nexus.uds.dev/saml",
            saml_single_logout_service_url_post: "https://nexus.uds.dev/saml/single-logout",
            saml_single_logout_service_url_redirect: "https://nexus.uds.dev/saml/single-logout",
          },
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies clients with a mix of supported and unsupported attributes", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          attributes: {
            "oidc.ciba.grant.enabled": "true",
            "unsupported.attribute": "true",
          },
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "uds-package-application" contains an unsupported attribute "unsupported.attribute"',
    );
  });

  it("allows clients without attributes", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          attributes: {},
        },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows clients with no attributes defined", async () => {
    const mockReq = makeMockReq({}, [], [], [{}]);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });
});
