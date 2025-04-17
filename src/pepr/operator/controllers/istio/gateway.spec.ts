/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { K8s } from "pepr";
import {
  generateEgressGateway,
  warnMatchingExistingGateways,
  generateGatewayName,
} from "./gateway";
import { EgressResource } from "./types";
import { IstioGateway, RemoteProtocol, IstioTLSMode } from "../../crd";
import { istioEgressGatewayNamespace } from "./istio-resources";

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
    expect(gateway.metadata?.namespace).toEqual("istio-egress-gateway");
    expect(gateway.metadata?.labels).toEqual({
      "uds/generation": generation.toString(),
      "uds/package": "shared-egress-resource",
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
jest.mock("pepr", () => ({
  K8s: jest.fn(),
  Log: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("does not warn when no gateways exist", async () => {
    const getMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [],
    });

    (K8s as jest.Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingGateways(host)).resolves.not.toThrow();
  });

  it("does not warn when gateway with same host name exists in egress gw namespace", async () => {
    const getMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: gwName,
            namespace: istioEgressGatewayNamespace,
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

    (K8s as jest.Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getMock,
        };
      }
    });

    await expect(warnMatchingExistingGateways(host)).resolves.not.toThrow();
  });

  it("does not warn when gateway with differnt host name exists in the egress gw namespace", async () => {
    const newHost = "httpbin.org";
    const newGwName = generateGatewayName(newHost);

    const getMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: newGwName,
            namespace: istioEgressGatewayNamespace,
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

    (K8s as jest.Mock).mockImplementation(kindType => {
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

    const getMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
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

    (K8s as jest.Mock).mockImplementation(kindType => {
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
