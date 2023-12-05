import { Capability } from "pepr";

export const istio = new Capability({
  name: "istio",
  description: "UDS Core Capability for Istio service mesh.",
});

export const { Store, When } = istio;
