import { Log } from "pepr";

import { handleFailure, shouldSkip, updateStatus } from ".";
import { processExemptions } from "../controllers/exemptions/exemptions";
import { Phase, UDSExemption } from "../crd";

export async function exemptReconciler(exempt: UDSExemption) {
  if (shouldSkip(exempt)) {
    return;
  }

  const metadata = exempt.metadata!;
  const { namespace, name } = metadata;

  Log.debug(exempt, `Processing Exemption ${namespace}/${name}`);

  try {
    // Mark the exemption as pending
    await updateStatus(exempt, { phase: Phase.Pending });

    // Process the exemptions
    processExemptions(exempt);

    // Mark the exemption as ready
    await updateStatus(exempt, {
      phase: Phase.Ready,
      observedGeneration: metadata.generation,
      titles: exempt.spec?.exemptions?.map(e => e.title || e.matcher.name),
    });
  } catch (err) {
    // Handle the failure
    void handleFailure(err, exempt);
  }
}
