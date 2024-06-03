import { PeprModule } from "pepr";

import cfg from "./package.json";

import { istio } from "./src/pepr/istio";
import { operator } from "./src/pepr/operator";
import { registerCRDs } from "./src/pepr/operator/crd/register";
import { policies, startExemptionWatch } from "./src/pepr/policies";
import { prometheus } from "./src/pepr/prometheus";

(async () => {
  // Apply the CRDs to the cluster
  await registerCRDs();
  // KFC watch for exemptions and update in-memory map
  await startExemptionWatch();
  new PeprModule(cfg, [
    // UDS Core Operator
    operator,

    // UDS Core Policies
    policies,

    // Istio service mesh
    istio,

    // Prometheus monitoring stack
    prometheus,
  ]);
})().catch(err => {
  console.error(err);
});
