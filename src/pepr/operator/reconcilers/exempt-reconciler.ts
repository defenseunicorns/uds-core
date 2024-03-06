import { Log } from "pepr";
import { updateStatus } from "../common";
import { processExemptions } from "../controllers/exemptions/exemptions";
import { Phase, UDSExemption } from "../crd";

export async function exemptReconciler(exempt: UDSExemption) {
  if (!exempt.metadata?.namespace) {
    Log.error(exempt, `Invalid Exemption definition`);
    return;
  }

  const isPending = exempt.status?.phase === Phase.Pending;
  const isCurrentGeneration = exempt.metadata?.generation === exempt.status?.observedGeneration;

  if (isPending || isCurrentGeneration) {
    Log.debug(exempt, `Skipping pending or completed exemption`);
    return;
  }

  const { namespace, name } = exempt.metadata;

  Log.debug(exempt, `Processing Exemption ${namespace}/${name}`);

  try {
    await updateStatus(exempt, { phase: Phase.Pending });

    processExemptions(exempt);
    await updateStatus(exempt, {
      phase: Phase.Ready,
      observedGeneration: exempt.metadata.generation,
      titles: exempt.spec?.exemptions?.map(e => e.title || e.matcher.name),
    });
  } catch (e) {
    Log.error(e, `Error configuring for ${namespace}/${name}`);
    // todo: need to evaluate when it is safe to retry (updating generation now avoids retrying infinitely)
    void updateStatus(exempt, {
      phase: Phase.Failed,
      observedGeneration: exempt.metadata.generation,
    });
  }
}
