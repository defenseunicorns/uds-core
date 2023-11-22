import { Capability } from "pepr";

export const UdsCorePolicies = new Capability({
  name: "uds-core-policies",
  description:
    "Collection of core validation policies for Pods, ConfigMaps, and other Kubernetes resources.",
});

export const When = UdsCorePolicies.When;
