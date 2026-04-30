/**
 * Copyright 2024-2026 Defense Unicorns
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
import { UDSConfig } from "../../controllers/config/config";
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
    const mockReq = makeMockReq({}, [], [], [], []);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies system namespaces", async () => {
    const mockReq = makeMockReq({ metadata: { namespace: "kube-system" } }, [], [], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows one package per namespace", async () => {
    const mockReqValidPkg = makeMockReq({}, [], [], [{}], [{}]);
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
    const mockReq = makeMockReq({}, [], [], [{}], [{}]);
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
    const mockReqValidPkg = makeMockReq({}, [{}], [], [{}], [{}]);
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
      [{ remoteGenerated: RemoteGenerated.Anywhere, remoteHost: "example.com" }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify remoteHost and remoteNamespace", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteHost: "example.com", remoteNamespace: "foo" }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify remoteHost and remoteSelector", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteHost: "example.com", remoteSelector: { app: "x" } }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify remoteHost and remoteCidr", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteHost: "example.com", remoteCidr: "10.0.0.0/8" }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify TLS remoteProtocol with no remote target", async () => {
    const mockReq = makeMockReq({}, [], [{ remoteProtocol: RemoteProtocol.TLS }], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify HTTP remoteProtocol with no remote target", async () => {
    const mockReq = makeMockReq({}, [], [{ remoteProtocol: RemoteProtocol.HTTP }], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify UDP remoteProtocol with remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteProtocol: RemoteProtocol.UDP, remoteHost: "example.com", port: 53 }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      expect.stringContaining("UDP remoteProtocol cannot be combined with remoteHost"),
    );
  });

  it("allows network policies that specify TCP remoteProtocol with remoteHost", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteHost: "example.com", remoteProtocol: RemoteProtocol.TCP, port: 443 }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify UDP remoteProtocol with KubeAPI", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteGenerated: RemoteGenerated.KubeAPI, remoteProtocol: RemoteProtocol.UDP, port: 443 }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      expect.stringContaining("UDP remoteProtocol cannot be combined with remoteGenerated"),
    );
  });

  it("denies network policies that specify UDP remoteProtocol with KubeNodes", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteGenerated: RemoteGenerated.KubeNodes,
          remoteProtocol: RemoteProtocol.UDP,
          port: 10250,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      expect.stringContaining("UDP remoteProtocol cannot be combined with remoteGenerated"),
    );
  });

  it("allows network policies that specify UDP remoteProtocol with remoteGenerated", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteGenerated: RemoteGenerated.Anywhere,
          remoteProtocol: RemoteProtocol.UDP,
          port: 5353,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows network policies that specify TCP remoteProtocol with remoteNamespace and port", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteNamespace: "foo", remoteProtocol: RemoteProtocol.TCP, port: 5432 }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows network policies that specify TCP remoteProtocol with remoteGenerated and port", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          remoteGenerated: RemoteGenerated.Anywhere,
          remoteProtocol: RemoteProtocol.TCP,
          port: 443,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows network policies that specify UDP remoteProtocol with remoteCidr and port", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteCidr: "10.0.0.0/8", remoteProtocol: RemoteProtocol.UDP, port: 5353 }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows network policies that specify TCP remoteProtocol with remoteCidr and port", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteCidr: "10.0.0.0/8", remoteProtocol: RemoteProtocol.TCP, port: 443 }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows network policies that specify UDP remoteProtocol with Ingress direction and remoteNamespace", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Ingress,
          remoteNamespace: "foo",
          remoteProtocol: RemoteProtocol.UDP,
          port: 9000,
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify HTTP remoteProtocol with Ingress direction", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Ingress,
          remoteProtocol: RemoteProtocol.HTTP,
          remoteHost: "example.com",
        },
      ],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that specify TCP remoteProtocol without any port", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteNamespace: "foo", remoteProtocol: RemoteProtocol.TCP }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      expect.stringContaining("TCP/UDP remoteProtocol requires at least one port"),
    );
  });

  it("denies network policies that specify UDP remoteProtocol without any port", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [{ remoteNamespace: "foo", remoteProtocol: RemoteProtocol.UDP }],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      expect.stringContaining("TCP/UDP remoteProtocol requires at least one port"),
    );
  });

  it("denies network policies that specify remoteProtocol TLS with Ingress direction", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        {
          direction: Direction.Ingress,
          remoteProtocol: RemoteProtocol.TLS,
          remoteHost: "example.com",
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

  it("denies network policies with no remote specified", async () => {
    const mockReq = makeMockReq({}, [], [{}], [], []);
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows network policies with remoteNamespace set to empty string (any namespace in cluster)", async () => {
    const mockReq = makeMockReq({}, [], [{ remoteNamespace: "" }], [], []);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("allows network policies with remoteSelector set to empty object (all pods)", async () => {
    const mockReq = makeMockReq({}, [], [{ remoteSelector: {} }], [], []);
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies network policies that are the same name", async () => {
    const mockReq = makeMockReq(
      {},
      [],
      [
        { remoteGenerated: RemoteGenerated.Anywhere },
        { remoteGenerated: RemoteGenerated.Anywhere },
      ],
      [],
      [],
    );
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

  // ALLOW_PUBLIC_CLIENTS gate (UDSConfig.allowPublicClients).
  // Device-flow-only public clients above are admitted regardless of the flag.
  // Non-device-flow public clients are admitted only when the flag is on AND
  // PKCE is set AND none of the forbidden option combinations are used.
  it("denies non-device-flow public clients when ALLOW_PUBLIC_CLIENTS is off (default)", async () => {
    UDSConfig.allowPublicClients = false;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("ALLOW_PUBLIC_CLIENTS"));
    UDSConfig.allowPublicClients = false;
  });

  it("allows non-device-flow public clients with PKCE S256 when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with PKCE plain when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "plain" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("S256"));
    UDSConfig.allowPublicClients = false;
  });

  // RFC 7636 mandates case-sensitive method strings. The operator pins the exact
  // value "S256"; a lowercase "s256" must be rejected at admission so that
  // Mission Heroes cannot slip a non-compliant value past the gate.
  it("denies non-device-flow public clients with a lowercase 's256' PKCE value", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "s256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("S256"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with an unknown PKCE method when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S512" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("S256"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with PKCE method surrounded by whitespace when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": " S256 " },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("S256"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients without PKCE when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      expect.stringContaining("pkce.code.challenge.method"),
    );
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with blank PKCE when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "   " },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    UDSConfig.allowPublicClients = false;
  });

  it("denies SAML public clients even with PKCE when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          protocol: Protocol.Saml,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("SAML"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with serviceAccountsEnabled when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          serviceAccountsEnabled: true,
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("serviceAccountsEnabled"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with a secret when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          secret: "should-not-be-here",
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("secret"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with secretConfig when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          secretConfig: { name: "custom-secret" },
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("secretConfig"));
    UDSConfig.allowPublicClients = false;
  });

  it("denies non-device-flow public clients with enableAuthserviceSelector when ALLOW_PUBLIC_CLIENTS is on", async () => {
    UDSConfig.allowPublicClients = true;
    const mockReq = makeMockReq(
      {},
      [],
      [],
      [
        {
          publicClient: true,
          standardFlowEnabled: true,
          enableAuthserviceSelector: { app: "test" },
          redirectUris: ["https://app.uds.dev/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(expect.stringContaining("enableAuthserviceSelector"));
    UDSConfig.allowPublicClients = false;
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
      'The client ID "test-client" has redirectUris containing root paths ("/"). Authservice clients cannot have root path redirect URIs.',
    );
    expect(mockReq.Approve).not.toHaveBeenCalled();
  });

  it("denies authservice clients with missing redirectUris", async () => {
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
          redirectUris: [],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "test-client" must specify redirectUris if standardFlowEnabled is turned on (it is enabled by default)',
    );
    expect(mockReq.Approve).not.toHaveBeenCalled();
  });

  it("denies authservice clients with empty redirectUris array", async () => {
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
          redirectUris: [],
        },
      ],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      'The client ID "test-client" must specify redirectUris if standardFlowEnabled is turned on (it is enabled by default)',
    );
    expect(mockReq.Approve).not.toHaveBeenCalled();
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
    expect(mockReq.Approve).not.toHaveBeenCalled();
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

describe("Uptime probe FQDN validation", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("allows expose entries with different FQDNs", async () => {
    const mockReq = makeMockReq(
      {},
      [
        { host: "app1", uptime: { checks: { paths: ["/"] } } },
        { host: "app2", uptime: { checks: { paths: ["/"] } } },
      ],
      [],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies duplicate FQDNs with uptime configured", async () => {
    const mockReq = makeMockReq(
      {},
      [
        { host: "app", description: "first", uptime: { checks: { paths: ["/"] } } },
        { host: "app", description: "second", uptime: { checks: { paths: ["/"] } } },
      ],
      [],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows duplicate FQDNs when uptime is not configured", async () => {
    const mockReq = makeMockReq(
      {},
      [
        { host: "app", description: "first", uptime: { checks: { paths: ["/"] } } },
        { host: "app", description: "second" },
      ],
      [],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies paths that don't start with /", async () => {
    const mockReq = makeMockReq(
      {},
      [{ host: "app", uptime: { checks: { paths: ["health"] } } }],
      [],
      [],
      [],
    );
    await validator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
  });

  it("allows paths that start with /", async () => {
    const mockReq = makeMockReq(
      {},
      [{ host: "app", uptime: { checks: { paths: ["/health", "/ready"] } } }],
      [],
      [],
      [],
    );
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
