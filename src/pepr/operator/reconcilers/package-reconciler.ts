import { Log } from "pepr";

import { UDSConfig } from "../../config";
import { updateStatus } from "../common";
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
export async function reconciler(pkg: UDSPackage) {
  migrate(pkg);

  if (!pkg.metadata?.namespace) {
    Log.error(pkg, `Invalid Package definition`);
    return;
  }

  const isPending = pkg.status?.phase === Phase.Pending;
  const isCurrentGeneration = pkg.metadata.generation === pkg.status?.observedGeneration;

  if (isPending || isCurrentGeneration) {
    Log.info(pkg, `Skipping pending or completed package`);
    return;
  }

  const { namespace, name } = pkg.metadata;

  Log.info(pkg, `Processing Package ${namespace}/${name}`);

  // Configure the namespace and namespace-wide network policies
  try {
    await updateStatus(pkg, { phase: Phase.Pending });

    const netPol = await networkPolicies(pkg, namespace);

    // Only configure the VirtualService if not running in single test mode
    let endpoints: string[] = [];
    if (!UDSConfig.isSingleTest) {
      // Update the namespace to ensure the istio-injection label is set
      await enableInjection(pkg);

      // Create the VirtualService for each exposed service
      endpoints = await virtualService(pkg, namespace);
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
      observedGeneration: pkg.metadata.generation,
    });
  } catch (err) {
    if (err.status === 404) {
      Log.warn({ err }, `Package ${namespace}/${name} seems to have been deleted`);
      return;
    }

    Log.error({ err }, `Error configuring ${namespace}/${name}`);

    // todo: need to evaluate when it is safe to retry (updating generation now avoids retrying infinitely)
    const status = { phase: Phase.Failed, observedGeneration: pkg.metadata.generation };
    updateStatus(pkg, status).catch(finalErr => {
      Log.error({ err: finalErr }, `Error updating status for ${namespace}/${name} failed`);
    });
  }
}
