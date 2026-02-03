/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { Expose, Gateway, IstioVirtualService, RemoteProtocol } from "../../crd/index.js";
import { UDSConfig } from "../config/config.js";
import { sharedEgressPkgId, sidecarEgressNamespace } from "./egress-sidecar.js";
import { EgressResource } from "./types.js";
import {
  generateEgressVirtualService,
  generateEgressVSName,
  generateIngressVirtualService,
  warnMatchingExistingVirtualServices,
} from "./virtual-service.js";

beforeEach(() => {
  UDSConfig.domain = "uds.dev";
  UDSConfig.adminDomain = "admin.uds.dev";
});

describe("test generate virtual service", () => {
  const ownerRefs = [
    {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      name: "test",
      uid: "f50120aa-2713-4502-9496-566b102b1174",
    },
  ];

  const host = "test";
  const port = 8080;
  const service = "test-service";

  const namespace = "test";
  const pkgName = "test";
  const generation = "1";

  describe("flexible gateway configuration", () => {
    it("should use custom domain when specified", () => {
      const expose: Expose = {
        host,
        port,
        service,
        gateway: "custom",
        domain: "custom.example.com",
      };

      const payload = generateIngressVirtualService(
        expose,
        namespace,
        pkgName,
        generation,
        ownerRefs,
      );

      expect(payload).toBeDefined();
      expect(payload.spec?.hosts).toBeDefined();
      expect(payload.spec!.hosts![0]).toEqual(`${host}.custom.example.com`);
      expect(payload.spec?.gateways).toEqual([`istio-custom-gateway/custom-gateway`]);
    });

    it("should use admin domain for custom gateway with 'admin' in the name", () => {
      const expose: Expose = {
        host,
        port,
        service,
        gateway: "my-admin",
      };

      const payload = generateIngressVirtualService(
        expose,
        namespace,
        pkgName,
        generation,
        ownerRefs,
      );

      expect(payload).toBeDefined();
      expect(payload.spec?.hosts).toBeDefined();
      expect(payload.spec!.hosts![0]).toEqual(`${host}.${UDSConfig.adminDomain}`);
    });

    it("should prioritize custom domain over gateway name pattern", () => {
      const expose: Expose = {
        host,
        port,
        service,
        gateway: "my-admin",
        domain: "custom.example.com",
      };

      const payload = generateIngressVirtualService(
        expose,
        namespace,
        pkgName,
        generation,
        ownerRefs,
      );

      expect(payload).toBeDefined();
      expect(payload.spec?.hosts).toBeDefined();
      expect(payload.spec!.hosts![0]).toEqual(`${host}.custom.example.com`);
    });

    it("should add TLS configuration for custom gateway with 'passthrough' in the name", () => {
      const expose: Expose = {
        host,
        port,
        service,
        gateway: "my-passthrough",
      };

      const payload = generateIngressVirtualService(
        expose,
        namespace,
        pkgName,
        generation,
        ownerRefs,
      );

      expect(payload).toBeDefined();
      expect(payload.spec?.tls).toBeDefined();
      expect(payload.spec?.hosts).toBeDefined();
      expect(payload.spec!.hosts![0]).toEqual(`${host}.${UDSConfig.domain}`);
      expect(payload.spec!.tls![0].match![0].sniHosts![0]).toEqual(`${host}.${UDSConfig.domain}`);
    });
  });

  it("should create a simple VirtualService object", () => {
    const expose: Expose = {
      host,
      port,
      service,
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual(
      `${pkgName}-${Gateway.Tenant}-${host}-${port}-${service}`,
    );
    expect(payload.metadata?.namespace).toEqual(namespace);

    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(`${host}.${UDSConfig.domain}`);

    expect(payload.spec?.http).toBeDefined();
    expect(payload.spec!.http![0].route).toBeDefined();
    expect(payload.spec!.http![0].route![0].destination?.host).toEqual(
      `${service}.${namespace}.svc.cluster.local`,
    );
    expect(payload.spec!.http![0].route![0].destination?.port?.number).toEqual(port);

    expect(payload.spec?.gateways).toBeDefined();
    expect(payload.spec!.gateways![0]).toEqual(
      `istio-${Gateway.Tenant}-gateway/${Gateway.Tenant}-gateway`,
    );
  });

  it("should create an admin VirtualService object", () => {
    const gateway = Gateway.Admin;
    const expose: Expose = {
      gateway,
      host,
      port,
      service,
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(`${host}.${UDSConfig.adminDomain}`);
  });

  it("should create a root domain VirtualService object for tenant gateway", () => {
    const expose: Expose = {
      host: ".",
      port,
      service,
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toContain("root-domain");
    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(UDSConfig.domain);
    expect(payload.spec?.gateways?.[0]).toContain(Gateway.Tenant);
  });

  it("should create a root domain VirtualService object for admin gateway", () => {
    const expose: Expose = {
      gateway: Gateway.Admin,
      host: ".",
      port,
      service,
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toContain("root-domain");
    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(UDSConfig.adminDomain);
    expect(payload.spec?.gateways?.[0]).toContain(Gateway.Admin);
  });

  it("should create an advancedHttp VirtualService object", () => {
    const advancedHTTP = {
      directResponse: { status: 404 },
    };
    const expose: Expose = {
      host,
      port,
      service,
      advancedHTTP,
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.spec?.http).toBeDefined();
    expect(payload.spec!.http![0].route).not.toBeDefined();
    expect(payload.spec!.http![0].directResponse?.status).toEqual(404);
  });

  it("should create a passthrough VirtualService object", () => {
    const gateway = Gateway.Passthrough;
    const expose: Expose = {
      gateway,
      host,
      port,
      service,
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.spec?.tls).toBeDefined();
    expect(payload.spec!.tls![0].match).toBeDefined();
    expect(payload.spec!.tls![0].match![0].port).toEqual(443);
    expect(payload.spec!.tls![0].match![0].sniHosts![0]).toEqual(`${host}.${UDSConfig.domain}`);
    expect(payload.spec!.tls![0].route).toBeDefined();
    expect(payload.spec!.http![0].route![0].destination?.host).toEqual(
      `${service}.${namespace}.svc.cluster.local`,
    );
    expect(payload.spec!.http![0].route![0].destination?.port?.number).toEqual(port);
  });

  it("should create a redirect VirtualService object", () => {
    const gateway = Gateway.Tenant;
    const expose: Expose = {
      gateway,
      host,
      port,
      service,
      advancedHTTP: { redirect: { uri: "https://example.com" } },
    };

    const payload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    expect(payload).toBeDefined();
    expect(payload.spec!.http![0].route).toBeUndefined();
    expect(payload.spec!.http![0].redirect?.uri).toEqual("https://example.com");
  });
});

describe("test generate egress virtual service", () => {
  it("should create an egress VirtualService object", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [
        { port: 80, protocol: RemoteProtocol.HTTP },
        { port: 443, protocol: RemoteProtocol.TLS },
      ],
    };
    const generation = 1;

    const virtualService = generateEgressVirtualService(host, resource, generation);

    expect(virtualService).toBeDefined();
    expect(virtualService.metadata?.name).toEqual("egress-vs-example-com");
    expect(virtualService.metadata?.namespace).toEqual(sidecarEgressNamespace);
    expect(virtualService.metadata?.labels).toEqual({
      "uds/generation": generation.toString(),
      "uds/package": sharedEgressPkgId,
    });
    expect(virtualService.metadata?.annotations).toEqual({
      "uds.dev/user-test-pkg1": "user",
      "uds.dev/user-test-pkg2": "user",
    });
    expect(virtualService.spec?.hosts).toEqual([host]);
    expect(virtualService.spec?.gateways).toEqual(["mesh", "gateway-example-com"]);
    expect(virtualService.spec?.http).toBeDefined();
    expect(virtualService.spec?.tls).toBeDefined();
  });

  it("should create an http egress VirtualService object", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [{ port: 80, protocol: RemoteProtocol.HTTP }],
    };
    const generation = 1;

    const virtualService = generateEgressVirtualService(host, resource, generation);

    expect(virtualService).toBeDefined();
    expect(virtualService.spec?.http).toBeDefined();
    expect(virtualService.spec?.tls).toBeUndefined();
  });

  it("should create a tls egress VirtualService object", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [{ port: 443, protocol: RemoteProtocol.TLS }],
    };
    const generation = 1;

    const virtualService = generateEgressVirtualService(host, resource, generation);

    expect(virtualService).toBeDefined();
    expect(virtualService.spec?.http).toBeUndefined();
    expect(virtualService.spec?.tls).toBeDefined();
  });
});

// Mock the necessary Kubernetes functions
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      level: "info",
    })),
  },
  kind: {
    VirtualService: "VirtualService",
  },
}));

describe("test warnMatchingExistingVirtualServices", () => {
  const host = "example.com";
  const vsName = generateEgressVSName(host);

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not warn when no virtual services exist", async () => {
    const getMock = vi.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
      items: [],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioVirtualService) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingVirtualServices(host)).resolves.not.toThrow();
  });

  it("does not warn when gateway with same host name exists in egress gw namespace", async () => {
    const getMock = vi.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: vsName,
            namespace: sidecarEgressNamespace,
          },
          spec: {
            hosts: [host],
          },
        },
      ],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioVirtualService) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingVirtualServices(host)).resolves.not.toThrow();
  });

  it("does not warn when gateway with different host name exists in the egress gw namespace", async () => {
    const newHost = "httpbin.org";
    const newVsName = generateEgressVSName(newHost);

    const getMock = vi.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: newVsName,
            namespace: sidecarEgressNamespace,
          },
          spec: {
            hosts: [newHost],
          },
        },
      ],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioVirtualService) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingVirtualServices(host)).resolves.not.toThrow();
  });

  it("warns when another gateway has matching host in a different namespace", async () => {
    const newVsName = "custom-gateway";
    const newVsNamespace = "custom-namespace";

    const getMock = vi.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: newVsName,
            namespace: newVsNamespace,
          },
          spec: {
            hosts: [host],
          },
        },
      ],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioVirtualService) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingVirtualServices(host)).rejects.toThrow(
      `Found existing Virtual Service ${newVsName}/${newVsNamespace} with matching host. Istio will not behave properly with multiple Virtual Services using the same hosts.`,
    );
  });
});
