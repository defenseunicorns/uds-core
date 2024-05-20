import { UDSExemption } from "../../crd";
import { addExemption, deleteExemption } from "./exemption-store";

export enum WatchPhase {
  Added = "ADDED",
  Modified = "MODIFIED",
  Deleted = "DELETED",
  Bookmark = "BOOKMARK",
  Error = "ERROR",
}

// Handle adding, updating, and deleting exemptions from Policymap
export function processExemptions(
  exempt: UDSExemption,
  phase: WatchPhase,
) {
  switch (phase) {
    case WatchPhase.Added:
    case WatchPhase.Modified: {
      addExemption(exempt);
      break;
    }

    case WatchPhase.Deleted:
      deleteExemption(exempt);
      break;
  }
}
