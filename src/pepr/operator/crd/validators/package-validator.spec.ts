/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Allow,
  Direction,
  Expose,
  Gateway,
  Monitor,
  Protocol,
  RemoteGenerated,
  Sso,
  UDSPackage,
} from "..";
import { PackageStore } from "../../controllers/packages/package-store";
import { Mode, RemoteProtocol } from "../generated/package-v1alpha1";
import { validator } from "./package-validator";

PackageStore.init();

const makeMockReq = (
  pkg: Partial<UDSPackage>,
  exposeList: Partial<Expose>[],
  allowList: Partial<Allow>[],
  ssoClients: Partial<Sso>[],
  monitorList: Partial<Monitor>[],
  ambient: boolean = false,
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
        serviceMesh: {
          mode: ambient ? Mode.Ambient : Mode.Sidecar,
        },
      },
      sso: [],
      monitor: [],
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

  for (const monitor of monitorList) {
    const defaultMonitor: Monitor = {
      description: "Default Monitor",
      portName: "http-metrics",
      selector: {},
      targetPort: 8080,
    };
    defaultPkg.spec!.monitor?.push({ ...defaultMonitor, ...monitor });
  }

  return {
    Raw: { ...defaultPkg, ...pkg },
    Approve: vi.fn(),
    Deny: vi.fn(),
  } as unknown as PeprValidateRequest<UDSPackage>;
};

describe("Test validation of Package CRs", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("approves serviceAccount in Ambient mode with remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Egress,
          remoteHost: "example.com",
          serviceAccount: "example-sa",
        },
      ],
      [],
      [],
      true, // ambient
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("approves serviceAccount in Ambient mode with remoteGenerated: Anywhere (Egress)", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Egress,
          remoteGenerated: RemoteGenerated.Anywhere,
          serviceAccount: "example-sa",
        },
      ],
      [],
      [],
      true, // ambient
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies serviceAccount in Sidecar mode even with remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Egress,
          remoteHost: "example.com",
          serviceAccount: "example-sa",
        },
      ],
      [],
      [],
      false, // sidecar
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies serviceAccount in Ambient mode with remoteGenerated: Anywhere on Ingress", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Ingress,
          remoteGenerated: RemoteGenerated.Anywhere,
          serviceAccount: "example-sa",
        },
      ],
      [],
      [],
      true, // ambient
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  describe("Gateway name validation", () => {
    it("allows valid custom gateway names", async () => {
      const mockReq = makeMockReq(
        {},
        [
          {
            gateway: "custom",
            host: "app",
            service: "app-service",
            port: 8080,
          },
        ],
        [],
        [],
        [],
      );
      await validator(mockReq);
      expect(mockReq.Approve).toHaveBeenCalledTimes(1);
    });

    it("denies invalid custom gateway names", async () => {
      const mockReq = makeMockReq(
        {},
        [
          {
            gateway: "Invalid_Gateway_Name",
            host: "app",
            service: "app-service",
            port: 8080,
          },
        ],
        [],
        [],
        [],
      );
      await validator(mockReq);
      expect(mockReq.Deny).toHaveBeenCalledTimes(1);
      expect(mockReq.Deny).toHaveBeenCalledWith(
        "Gateway name \"Invalid_Gateway_Name\" is not a valid Kubernetes resource name. It should only contain lowercase alphanumeric characters, '-', or '.'",
      );
    });

    it("denies setting domain for standard gateways", async () => {
      const mockReq = makeMockReq(
        {},
        [
          {
            gateway: Gateway.Tenant,
            domain: "custom.example.com",
            host: "app",
            service: "app-service",
            port: 8080,
          },
        ],
        [],
        [],
        [],
      );
      await validator(mockReq);
      expect(mockReq.Deny).toHaveBeenCalledTimes(1);
      expect(mockReq.Deny).toHaveBeenCalledWith(
        "domain cannot be set for the standard gateways (tenant, admin, or passthrough)",
      );
    });

    it("allows setting domain for custom gateways", async () => {
      const mockReq = makeMockReq(
        {},
        [
          {
            gateway: "custom",
            domain: "custom.example.com",
            host: "app",
            service: "app-service",
            port: 8080,
          },
        ],
        [],
        [],
        [],
      );
      await validator(mockReq);
      expect(mockReq.Approve).toHaveBeenCalledTimes(1);
    });
  });

  it("allows packages that have no issues", async () => {
    const mockReq = makeMockReq({}, [{}], [{}], [{}], [{}]);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies system namespaces", async () => {
    const mockReq = makeMockReq({ metadata: { namespace: "kube-system" } }, [], [], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows one package per namespace", async () => {
    const mockReqValidPkg = makeMockReq({}, [], [{}], [{}], [{}]);
    await validator(mockReqValidPkg);
    const mockReqInvalidPkg = makeMockReq(
      { metadata: { name: "should-be-denied" } },
      [],
      [],
      [],
      [],
    );
    await validator(mockReqInvalidPkg);
    expect(mockReqInvalidPkg.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows packages to be created in unique namespaces", async () => {
    const mockReq = makeMockReq({}, [], [{}], [{}], [{}]);
    await validator(mockReq);
    const mockReqNewPkg = makeMockReq(
      { metadata: { namespace: "foo", name: "should-be-approved" } },
      [],
      [],
      [],
      [],
    );
    await validator(mockReqNewPkg);
    expect(mockReqNewPkg.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows existing packages to be updated", async () => {
    const mockReqValidPkg = makeMockReq({}, [{}], [{}], [{}], [{}]);
    await validator(mockReqValidPkg);
    const mockReqValidPkgUpdate = makeMockReq({ spec: { network: {} } }, [], [], [], []);
    await validator(mockReqValidPkgUpdate);
    expect(mockReqValidPkgUpdate.Approve).toHaveBeenCalledTimes(1);
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
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies virtual services that are the same name", async () => {
    const mockReq = makeMockReq({}, [{}, {}], [], [], []);
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
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify remoteHost and remoteGenerated", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteGenerated: RemoteGenerated.Anywhere,
          remoteHost: "example.com",
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify remoteProtocol and not remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteProtocol: RemoteProtocol.TLS,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify ingress and remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Ingress,
          remoteHost: "example.com",
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify remoteHost as a wildcard", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteHost: "*.example.com",
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify serviceAccount without a remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          serviceAccount: "example-sa",
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that are the same name", async () => {
    const mockReq = makeMockReq({}, [], [{}, {}], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies clients with clientIDs that are not unique within the same package", async () => {
    const mockReq = makeMockReq({}, [], [], [{}, {}], []);
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
          secretConfig: {
            name: "HELLO_KITTEH",
          },
        },
      ],
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using a secretConfig.name", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          secretConfig: {
            name: "app-k8s-secret",
          },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies public device flow clients using a secretConfig.template", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          attributes: { "oauth2.device.authorization.grant.enabled": "true" },
          standardFlowEnabled: false,
          secretConfig: {
            template: {},
          },
        },
      ],
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies authservice clients with redirectUris containing URLs with root paths", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "test-client",
          enableAuthserviceSelector: {
            app: "test",
          },
          redirectUris: ["https://google.com/"],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "test-client" has redirectUris containing root paths ("/" or "/*"). Authservice clients cannot have root path redirect URIs.',
    );
  });

  it("denies authservice clients with redirectUris containing URLs with wildcard root paths", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "test-client",
          enableAuthserviceSelector: {
            app: "test",
          },
          redirectUris: ["https://google.com/*"],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "test-client" has redirectUris containing root paths ("/" or "/*"). Authservice clients cannot have root path redirect URIs.',
    );
  });

  it("allows authservice clients with valid redirectUris", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "test-client",
          enableAuthserviceSelector: {
            app: "test",
          },
          redirectUris: ["https://example.com/callback"],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("url parsing failure when redirectUri is not a valid URL", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "test-client",
          enableAuthserviceSelector: {
            app: "test",
          },
          redirectUris: ["/", "https://example.com/callback"],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "test-client" has an invalid redirect URI "/". Redirect URIs must be valid URLs.',
    );
  });

  it("allows non-authservice clients with root-only redirectUris", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          clientId: "test-client",
          // No enableAuthserviceSelector
          redirectUris: ["/"],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });
});

describe("Test Allowed SSO Client Attributes", () => {
  afterEach(() => {
    vi.resetAllMocks();
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
      [],
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
            "use.refresh.tokens": "false",
            "saml.encrypt": "false",
            saml_name_id_format: "username",
            "saml.signing.certificate": "",
            saml_assertion_consumer_url_post: "https://nexus.uds.dev/saml",
            saml_assertion_consumer_url_redirect: "https://nexus.uds.dev/saml",
            saml_single_logout_service_url_post: "https://nexus.uds.dev/saml/single-logout",
            saml_single_logout_service_url_redirect: "https://nexus.uds.dev/saml/single-logout",
          },
        },
      ],
      [],
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
      [],
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
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows clients with no attributes defined", async () => {
    const mockReq = makeMockReq({}, [], [], [{}], []);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });
});

describe("Test proper generation of a unique name for service monitors", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("given an undefined description, a unique serviceMonitor name should be generated using the selector and portName fields", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [],
      [
        { description: undefined, portName: "http-foo", selector: { key: "foo" } },
        { description: undefined, portName: "http-bar", selector: { key: "bar" } },
      ],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(0);
  });

  it("denies monitors that do not have unique descriptions", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [],
      [{ description: "Metrics" }, { description: "Metrics" }],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });
});
