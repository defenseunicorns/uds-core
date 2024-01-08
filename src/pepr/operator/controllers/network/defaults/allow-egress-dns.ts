import { Direction } from "../../../crd";
import { generate } from "../generate";

export const allowEgressDNS = (namespace: string) => {
  const netPol = generate(namespace, {
    direction: Direction.Egress,
    description: "DNS lookup to any DNS server",
    remoteNamespace: "*",
    port: 53,
  });

  // Override the generated policy to use UDP instead of TCP
  netPol.spec!.egress![0].ports![0].protocol = "UDP";

  return netPol;
};
