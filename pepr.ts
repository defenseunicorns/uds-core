import { Log, PeprModule } from "pepr";

import cfg from "./package.json";

import { DataStore } from "pepr/dist/lib/storage";
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
  if (
    process.env.PEPR_MODE === "dev" ||
    (process.env.PEPR_WATCH_MODE === "true" && cfg.version === "0.5.0")
  ) {
    Log.debug("Clearing legacy pepr store exemption entries...");
    policies.Store.onReady((data: DataStore) => {
      const policiesList = Object.values(Policy);
      for (const p of Object.keys(data)) {
        // if p matches a Policy key, remove it
        if (policiesList.includes(p as Policy)) {
          Log.debug(`Removing legacy storage of ${p} policy exemptions...`);
          policies.Store.removeItem(p);
        }
      }
    });
  }
})().catch(err => {
  Log.error(err);
  process.exit(1);
});
