import { Capability, a } from "pepr";

export const IstioInjection = new Capability({
  name: "istio-injection",
  description:
    "Ensure Istio sidecar injection is explicitly enabled or disabled",
});

// Use the 'When' function to create a new action
const { When } = IstioInjection;

When(a.Namespace)
  .IsCreatedOrUpdated()
  .Mutate(ns => {
    // If the istio-injection label is not present, add it and set it to "enabled"
    if (!ns.HasLabel("istio-injection")) {
      ns.SetLabel("istio-injection", "enabled");
    }
  });
