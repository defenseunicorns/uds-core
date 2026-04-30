/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { describe, expect, it } from "vitest";
import { Direction } from "../../crd";
import { Mode, RemoteProtocol } from "../../crd/generated/package-v1alpha1";
import { generate } from "./generate";

describe("network policy generate", () => {
  it("should generate correct network policy", async () => {
    const policy = generate("test", {
      description: "test",
      direction: Direction.Ingress,
      selector: { app: "test" },
      remoteNamespace: "foo",
      remoteSelector: { app: "foo" },
    });

    expect(policy.metadata?.name).toEqual("Ingress-test");
    expect(policy.spec).toEqual({
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "foo",
                },
              },
              podSelector: {
                matchLabels: {
                  app: "foo",
                },
              },
            },
          ],
          ports: [],
        },
      ],
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Ingress"],
    } as kind.NetworkPolicy["spec"]);
  });
});

describe("network policy generate with remoteNamespace only", () => {
  it("should generate correct network policy for just remoteNamespace", async () => {
    const policy = generate("test", {
      description: "test",
      direction: Direction.Ingress,
      selector: { app: "test" },
      remoteNamespace: "foo",
    });

    expect(policy.metadata?.name).toEqual("Ingress-test");
    expect(policy.spec).toEqual({
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "foo",
                },
              },
            },
          ],
          ports: [],
        },
      ],
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Ingress"],
    } as kind.NetworkPolicy["spec"]);
  });
});

describe("network policy generate with wildcard remoteNamespace", () => {
  it("should generate correct network policy for empty string and wildcard remoteNamespace", async () => {
    const policy = generate("test", {
      description: "test",
      direction: Direction.Egress,
      selector: { app: "test" },
      remoteNamespace: "",
    });

    expect(policy.metadata?.name).toEqual("Egress-test");
    expect(policy.spec).toEqual({
      egress: [
        {
          ports: [],
          to: [{ namespaceSelector: {} }],
        },
      ],
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Egress"],
    } as kind.NetworkPolicy["spec"]);
  });

  it("should generate correct network policy for wildcard remoteNamespace '*'", () => {
    const policyWildcard = generate("test", {
      description: "test",
      direction: Direction.Egress,
      selector: { app: "test" },
      remoteNamespace: "*",
    });

    expect(policyWildcard.spec).toEqual({
      egress: [
        {
          ports: [],
          to: [{ namespaceSelector: {} }],
        },
      ],
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Egress"],
    } as kind.NetworkPolicy["spec"]);
  });
});

describe("network policy generate with remoteCidr", () => {
  it("should generate correct network policy with remoteCidr for Egress", async () => {
    const policy = generate("test", {
      description: "test",
      direction: Direction.Egress,
      selector: { app: "test" },
      remoteCidr: "192.168.0.0/16",
    });

    expect(policy.metadata?.name).toEqual("Egress-test");
    expect(policy.spec).toEqual({
      egress: [
        {
          to: [
            {
              ipBlock: {
                cidr: "192.168.0.0/16",
              },
            },
          ],
          ports: [],
        },
      ],
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Egress"],
    } as kind.NetworkPolicy["spec"]);
  });

  it("should generate correct network policy with remoteCidr for Ingress", async () => {
    const policy = generate("test", {
      description: "test",
      direction: Direction.Ingress,
      selector: { app: "test" },
      remoteCidr: "10.0.0.0/8",
    });

    expect(policy.metadata?.name).toEqual("Ingress-test");
    expect(policy.spec).toEqual({
      ingress: [
        {
          from: [
            {
              ipBlock: {
                cidr: "10.0.0.0/8",
              },
            },
          ],
          ports: [],
        },
      ],
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Ingress"],
    } as kind.NetworkPolicy["spec"]);
  });
});

describe("network policy generate with remoteHost", () => {
  it("should generate correct network policy with egressWaypoint for ambient mode", async () => {
    const policy = generate(
      "test-namespace",
      {
        description: "ambient-egress-test",
        direction: Direction.Egress,
        selector: { app: "test-app" },
        remoteHost: "example.com",
        port: 443,
      },
      Mode.Ambient,
    );

    expect(policy.metadata?.name).toEqual("Egress-ambient-egress-test");
    expect(policy.metadata?.namespace).toEqual("test-namespace");
    expect(policy.spec).toEqual({
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "istio-egress-ambient",
                },
              },
              podSelector: {
                matchLabels: {
                  "gateway.networking.k8s.io/gateway-name": "egress-waypoint",
                },
              },
            },
          ],
          ports: [{ port: 443 }],
        },
      ],
      podSelector: { matchLabels: { app: "test-app" } },
      policyTypes: ["Egress"],
    } as kind.NetworkPolicy["spec"]);
  });

  it("should generate correct network policy with egressGateway for sidecar mode", async () => {
    const policy = generate(
      "test-namespace",
      {
        description: "sidecar-egress-test",
        direction: Direction.Egress,
        selector: { app: "test-app" },
        remoteHost: "example.com",
        ports: [80, 8080],
      },
      Mode.Sidecar,
    );

    expect(policy.metadata?.name).toEqual("Egress-sidecar-egress-test");
    expect(policy.metadata?.namespace).toEqual("test-namespace");
    expect(policy.spec).toEqual({
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "istio-egress-gateway",
                },
              },
              podSelector: {
                matchLabels: {
                  app: "egressgateway",
                },
              },
            },
          ],
          ports: [{ port: 80 }, { port: 8080 }],
        },
      ],
      podSelector: { matchLabels: { app: "test-app" } },
      policyTypes: ["Egress"],
    } as kind.NetworkPolicy["spec"]);
  });

  it("should generate sidecar network policy when no istioState specified", async () => {
    const policy = generate("test-namespace", {
      description: "default-egress-test",
      direction: Direction.Egress,
      selector: { app: "test-app" },
      remoteHost: "example.com",
    });

    expect(policy.metadata?.name).toEqual("Egress-default-egress-test");
    expect(policy.metadata?.namespace).toEqual("test-namespace");
    expect(policy.spec).toEqual({
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "istio-egress-gateway",
                },
              },
              podSelector: {
                matchLabels: {
                  app: "egressgateway",
                },
              },
            },
          ],
          ports: [],
        },
      ],
      podSelector: { matchLabels: { app: "test-app" } },
      policyTypes: ["Egress"],
    } as kind.NetworkPolicy["spec"]);
  });
});

describe("network policy generate with remoteProtocol", () => {
  it("should set protocol: UDP on ports when remoteProtocol is UDP", () => {
    const policy = generate("test", {
      description: "test-udp",
      direction: Direction.Egress,
      remoteNamespace: "kube-system",
      remoteSelector: { "k8s-app": "kube-dns" },
      port: 53,
      remoteProtocol: RemoteProtocol.UDP,
    });

    expect(policy.spec?.egress?.[0].ports).toEqual([{ port: 53, protocol: "UDP" }]);
  });

  it("should set protocol: TCP on ports when remoteProtocol is TCP", () => {
    const policy = generate("test", {
      description: "test-tcp",
      direction: Direction.Egress,
      remoteNamespace: "kube-system",
      port: 8080,
      remoteProtocol: RemoteProtocol.TCP,
    });

    expect(policy.spec?.egress?.[0].ports).toEqual([{ port: 8080, protocol: "TCP" }]);
  });

  it("should not set protocol on ports when remoteProtocol is TLS", () => {
    const policy = generate("test", {
      description: "test-tls",
      direction: Direction.Egress,
      remoteHost: "example.com",
      port: 443,
      remoteProtocol: RemoteProtocol.TLS,
    });

    expect(policy.spec?.egress?.[0].ports).toEqual([{ port: 443 }]);
  });

  it("should not set protocol on ports when remoteProtocol is omitted", () => {
    const policy = generate("test", {
      description: "test-no-protocol",
      direction: Direction.Ingress,
      remoteNamespace: "foo",
      port: 8080,
    });

    expect(policy.spec?.ingress?.[0].ports).toEqual([{ port: 8080 }]);
  });

  it("should apply remoteProtocol to both port and ports", () => {
    const policy = generate("test", {
      description: "test-udp-multi",
      direction: Direction.Egress,
      remoteNamespace: "kube-system",
      port: 53,
      ports: [5353],
      remoteProtocol: RemoteProtocol.UDP,
    });

    expect(policy.spec?.egress?.[0].ports).toEqual([
      { port: 5353, protocol: "UDP" },
      { port: 53, protocol: "UDP" },
    ]);
  });

  it("should set protocol: UDP on ingress ports when remoteProtocol is UDP", () => {
    const policy = generate("test", {
      description: "test-udp-ingress",
      direction: Direction.Ingress,
      remoteNamespace: "some-namespace",
      port: 9999,
      remoteProtocol: RemoteProtocol.UDP,
    });

    expect(policy.spec?.ingress?.[0].ports).toEqual([{ port: 9999, protocol: "UDP" }]);
  });
});
