import { UDSExemption } from "../../crd";
import { ExemptionStore } from "./exemption-store";

export enum WatchPhase {
  Added = "ADDED",
  Modified = "MODIFIED",
  Deleted = "DELETED",
  Bookmark = "BOOKMARK",
  Error = "ERROR",
}

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
