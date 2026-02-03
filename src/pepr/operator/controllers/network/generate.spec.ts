/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { describe, expect, it } from "vitest";
import { Mode } from "../../crd/generated/package-v1alpha1.js";
import { Direction } from "../../crd/index.js";
import { generate } from "./generate.js";

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

describe("network policy generate", () => {
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

describe("network policy generate", () => {
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
