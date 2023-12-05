import { a } from "pepr";

import { When } from "./common";

/**
 * Watch Namespaces for creation or updates and ensure the istio-injection label is set
 */
When(a.Namespace)
  .IsCreatedOrUpdated()
  .Mutate(ns => {
    // If the istio-injection label is not present, add it and set it to "enabled"
    if (!ns.HasLabel("istio-injection")) {
      ns.SetLabel("istio-injection", "enabled");
    }
  });
