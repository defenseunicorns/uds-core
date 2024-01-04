import { K8s, Log } from "pepr";

import { UDSConfig } from "../config";
import { virtualService } from "./controllers/istio";
import { syncNamespace } from "./controllers/namespace";
import { networkPolicies } from "./controllers/network";
import { Phase, Status, UDSPackage } from "./crd";
import { VirtualService } from "./crd/generated/istio/virtualservice-v1beta1";

/**
 * The reconciler is called from the queue and is responsible for reconciling the state of the package
 * with the cluster. This includes creating the namespace, network policies and virtual services.
 *
 * @param pkg the package to reconcile
 */
export async function reconciler(pkg: UDSPackage) {
  if (!pkg.metadata?.namespace) {
    Log.error(pkg, `Invalid Package definition`);
    return;
  }

  const isPending = pkg.status?.phase === Phase.Pending;
  const isCurrentGeneration = pkg.metadata.generation === pkg.status?.observedGeneration;

  if (isPending || isCurrentGeneration) {
    Log.debug(pkg, `Skipping pending or completed package`);
    return;
  }

  Log.debug(pkg, `Processing Package ${pkg.metadata.namespace}/${pkg.metadata.name}`);

  // Configure the namespace and namespace-wide network policies
  try {
    void updateStatus(pkg, { phase: Phase.Pending });

    const namespace = await syncNamespace(pkg);

    const netPol = await networkPolicies(pkg, namespace);

    // Only configure the VirtualService if Istio is installed
    let vs: VirtualService[] = [];
    if (UDSConfig.istioInstalled) {
      vs = await virtualService(pkg, namespace);
    } else {
      Log.warn(`Istio is not installed, skipping ${pkg.metadata.name} VirtualService.`);
    }

    await updateStatus(pkg, {
      phase: Phase.Ready,
      endpoints: vs.map(v => v.spec!.hosts!.join(",")),
      networkPolicyCount: netPol.length,
      observedGeneration: pkg.metadata.generation,
    });
  } catch (e) {
    Log.error(e, `Error configuring for ${pkg.metadata.namespace}/${pkg.metadata.name}`);
    // todo: need to evaluate when it is safe to retry (updating generation now avoids retrying infinitely)
    void updateStatus(pkg, { phase: Phase.Failed, observedGeneration: pkg.metadata.generation });
  }
}

/**
 * Updates the status of the package
 *
 * @param pkg The package to update
 * @param status The new status
 */
async function updateStatus(pkg: UDSPackage, status: Status) {
  await K8s(UDSPackage).PatchStatus({
    metadata: {
      name: pkg.metadata!.name,
      namespace: pkg.metadata!.namespace,
    },
    status,
  });
}
