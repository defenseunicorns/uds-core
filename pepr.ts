import { Log, PeprModule } from "pepr";

import cfg from "./package.json";

import { istio } from "./src/pepr/istio";
import { operator } from "./src/pepr/operator";
import { Policy } from "./src/pepr/operator/crd";
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
  // Remove legacy policy entries from the pepr store for the 0.5.0 upgrade
  if (process.env.PEPR_WATCH_MODE === "true" && cfg.version === "0.5.0") {
    Log.debug("Clearing legacy pepr store exemption entries...");
    policies.Store.onReady(() => {
      for (const p of Object.values(Policy)) {
        policies.Store.removeItem(p);
      }
    });
  }
})().catch(err => {
  Log.error(err);
  process.exit(1);
});
