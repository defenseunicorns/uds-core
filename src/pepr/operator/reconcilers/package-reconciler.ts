import { Log } from "pepr";

import { handleFailure, shouldSkip, updateStatus } from ".";
import { UDSConfig } from "../../config";
import { enableInjection } from "../controllers/istio/injection";
import { virtualService } from "../controllers/istio/virtual-service";
import { keycloak } from "../controllers/keycloak/client-sync";
import { networkPolicies } from "../controllers/network/policies";
import { Phase, UDSPackage } from "../crd";
import { migrate } from "../crd/migrate";

/**
 * The reconciler is called from the queue and is responsible for reconciling the state of the package
 * with the cluster. This includes creating the namespace, network policies and virtual services.
 *
 * @param pkg the package to reconcile
 */
export async function packageReconciler(pkg: UDSPackage) {
  const metadata = pkg.metadata!;
  const { namespace, name } = metadata;

  Log.info(pkg, `Processing Package ${namespace}/${name}`);

  if (shouldSkip(pkg)) {
    Log.info(pkg, `Skipping Package ${namespace}/${name}`);
    return;
  }

  // Migrate the package to the latest version
  migrate(pkg);

  // Configure the namespace and namespace-wide network policies
  try {
    await updateStatus(pkg, { phase: Phase.Pending });

    const netPol = await networkPolicies(pkg, namespace!);

    // Only configure the VirtualService if not running in single test mode
    let endpoints: string[] = [];
    if (!UDSConfig.isSingleTest) {
      // Update the namespace to ensure the istio-injection label is set
      await enableInjection(pkg);

      // Create the VirtualService for each exposed service
      endpoints = await virtualService(pkg, namespace!);
    } else {
      Log.warn(`Running in single test mode, skipping ${name} VirtualService.`);
    }

    // Configure SSO
    const ssoClients = await keycloak(pkg);

    await updateStatus(pkg, {
      phase: Phase.Ready,
      ssoClients,
      endpoints,
      networkPolicyCount: netPol.length,
      observedGeneration: metadata.generation,
    });
  } catch (err) {
    void handleFailure(err, pkg);
  }
}
