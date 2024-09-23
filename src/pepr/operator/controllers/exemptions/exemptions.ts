import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/types";
import { UDSExemption } from "../../crd";
import { ExemptionStore } from "./exemption-store";

// Handle adding, updating, and deleting exemptions from Policymap
export function processExemptions(exemption: UDSExemption, phase: WatchPhase) {
  switch (phase) {
    case WatchPhase.Added:
    case WatchPhase.Modified:
      ExemptionStore.add(exemption);
      break;

    case WatchPhase.Deleted:
      ExemptionStore.remove(exemption);
      break;
  }
}
