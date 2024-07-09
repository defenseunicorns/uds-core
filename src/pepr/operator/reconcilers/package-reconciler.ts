import { handleFailure, shouldSkip, updateStatus } from ".";
import { UDSConfig } from "../../config";
import { Component, setupLogger } from "../../logger";
import { enableInjection } from "../controllers/istio/injection";
import { istioResources } from "../controllers/istio/istio-resources";
import { authservice } from "../controllers/keycloak/authservice/authservice";
import { keycloak } from "../controllers/keycloak/client-sync";
import { serviceMonitor } from "../controllers/monitoring/service-monitor";
import { networkPolicies } from "../controllers/network/policies";
import { Phase, UDSPackage } from "../crd";
import { migrate } from "../crd/migrate";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_RECONCILERS);

/**
 * The reconciler is called from the queue and is responsible for reconciling the state of the package
 * with the cluster. This includes creating the namespace, network policies and virtual services.
 *
 * @param pkg the package to reconcile
 */
export async function packageReconciler(pkg: UDSPackage) {
  const metadata = pkg.metadata!;
  const { namespace, name } = metadata;

  log.info(
    `Processing Package ${namespace}/${name}, status.phase: ${pkg.status?.phase}, observedGeneration: ${pkg.status?.observedGeneration}, retryAttempt: ${pkg.status?.retryAttempt}`,
  );

  if (shouldSkip(pkg)) {
    log.info(
      `Skipping Package ${namespace}/${name}, status.phase: ${pkg.status?.phase}, observedGeneration: ${pkg.status?.observedGeneration}, retryAttempt: ${pkg.status?.retryAttempt}`,
    );
    return;
  }

  // Migrate the package to the latest version
  migrate(pkg);

  // Configure the namespace and namespace-wide network policies
  try {
    await updateStatus(pkg, { phase: Phase.Pending });

    const netPol = await networkPolicies(pkg, namespace!);

    let endpoints: string[] = [];
    // Update the namespace to ensure the istio-injection label is set
    await enableInjection(pkg);

    // Configure SSO
    const ssoClients = await keycloak(pkg);
    const authserviceClients = await authservice(pkg, ssoClients);

    // Create the VirtualService and ServiceEntry for each exposed service
    endpoints = await istioResources(pkg, namespace!);

    // Only configure the ServiceMonitors if not running in single test mode
    let monitors: string[] = [];
    if (!UDSConfig.isSingleTest) {
      // Create the ServiceMonitor for each monitored service
      monitors = await serviceMonitor(pkg, namespace!);
    } else {
      log.warn(`Running in single test mode, skipping ${name} ServiceMonitors.`);
    }

    await updateStatus(pkg, {
      phase: Phase.Ready,
      ssoClients: [...ssoClients.keys()],
      authserviceClients,
      endpoints,
      monitors,
      networkPolicyCount: netPol.length,
      observedGeneration: metadata.generation,
      retryAttempt: 0, // todo: make this nullable when kfc generates the type
    });
  } catch (err) {
    void handleFailure(err, pkg);
  }
}
