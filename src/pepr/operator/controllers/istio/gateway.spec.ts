/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { IstioGateway, IstioTLSMode, RemoteProtocol } from "../../crd";
import {
  generateEgressGateway,
  generateGatewayName,
  warnMatchingExistingGateways,
} from "./gateway";
import { sharedEgressPkgId, sidecarEgressNamespace } from "./shared/constants";
import { EgressResource } from "./types";

describe("test generate egress gateway", () => {
  it("should create an http gateway object", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [{ port: 80, protocol: RemoteProtocol.HTTP }],
    };
    const generation = 1;

    const gateway = generateEgressGateway(host, resource, generation);

    expect(gateway).toBeDefined();
    expect(gateway.metadata?.name).toEqual("gateway-example-com");
    expect(gateway.metadata?.namespace).toEqual(sidecarEgressNamespace);
    expect(gateway.metadata?.labels).toEqual({
      "uds/generation": generation.toString(),
      "uds/package": sharedEgressPkgId,
    });
    expect(gateway.metadata?.annotations).toEqual({
      "uds.dev/user-test-pkg1": "user",
      "uds.dev/user-test-pkg2": "user",
    });
    expect(gateway.spec?.servers).toBeDefined();
    expect(gateway.spec?.servers?.[0].hosts).toEqual([host]);
    expect(gateway.spec?.servers?.[0].port?.number).toEqual(80);
    expect(gateway.spec?.servers?.[0].port?.protocol).toEqual(RemoteProtocol.HTTP);
    expect(gateway.spec?.servers?.[0].tls?.mode).toEqual(IstioTLSMode.Passthrough);
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
    Gateway: "Gateway",
  },
}));

describe("test warnMatchingExistingGateways", () => {
  const host = "example.com";
  const gwName = generateGatewayName(host);

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not warn when no gateways exist", async () => {
    const getMock = vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingGateways(host)).resolves.not.toThrow();
  });

  it("does not warn when gateway with same host name exists in egress gw namespace", async () => {
    const getMock = vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: gwName,
            namespace: sidecarEgressNamespace,
          },
          spec: {
            servers: [
              {
                hosts: [host],
                port: {
                  name: "tls-443",
                  number: 443,
                  protocol: RemoteProtocol.TLS,
                },
              },
            ],
          },
        },
      ],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingGateways(host)).resolves.not.toThrow();
  });

  it("does not warn when gateway with different host name exists in the egress gw namespace", async () => {
    const newHost = "httpbin.org";
    const newGwName = generateGatewayName(newHost);

    const getMock = vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: newGwName,
            namespace: sidecarEgressNamespace,
          },
          spec: {
            servers: [
              {
                hosts: [newHost],
                port: {
                  name: "tls-443",
                  number: 443,
                  protocol: RemoteProtocol.TLS,
                },
              },
            ],
          },
        },
      ],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingGateways(host)).resolves.not.toThrow();
  });

  it("warns when another gateway has matching host in a different namespace", async () => {
    const newGwName = "custom-gateway";
    const newGwNamespace = "custom-namespace";

    const getMock = vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: newGwName,
            namespace: newGwNamespace,
          },
          spec: {
            servers: [
              {
                hosts: [host],
                port: {
                  name: "tls-443",
                  number: 443,
                  protocol: RemoteProtocol.TLS,
                },
              },
            ],
          },
        },
      ],
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingGateways(host)).rejects.toThrow(
      `Found existing Gateway ${newGwName}/${newGwNamespace} with matching host. Istio will not behave properly with multiple Gateways using the same hosts.`,
    );
  });
});
