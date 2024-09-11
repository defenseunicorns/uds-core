import { describe, expect, it } from "@jest/globals";
import { kind } from "pepr";
import { Direction } from "../../crd";
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
                except: ["169.254.169.254/32"], // Include the except field here
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
                except: ["169.254.169.254/32"], // Include the except field here
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
