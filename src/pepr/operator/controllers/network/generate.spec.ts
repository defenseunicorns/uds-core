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
  it("should generate correct network policy for just remoteNamespace", async () => {
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
});
