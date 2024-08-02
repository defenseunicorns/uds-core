import { FinalizerOperation, handleFailure, handleFinalizer, shouldSkip, updateStatus } from ".";
import { UDSConfig } from "../../config";
import { Component, setupLogger } from "../../logger";
import { cleanupNamespace, enableInjection } from "../controllers/istio/injection";
import { istioResources } from "../controllers/istio/istio-resources";
import { authservice, purgeAuthserviceClients } from "../controllers/keycloak/authservice/authservice";
import { keycloak, purgeSSOClients } from "../controllers/keycloak/client-sync";
import { podMonitor } from "../controllers/monitoring/pod-monitor";
import { serviceMonitor } from "../controllers/monitoring/service-monitor";
import { networkPolicies } from "../controllers/network/policies";
import { Phase, UDSPackage } from "../crd";
import { migrate } from "../crd/migrate";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_RECONCILERS);

/**
 * The reconciler is called from the queue and is responsible for reconciling the state of the package
 * with the cluster. This includes istio injecting the namespace, adding network policies, SSO clients,
 * Prometheus monitors, and virtual services (and removing/undoing these for deletions).
 *
 * @param pkg the package to reconcile
 */
export async function packageReconciler(pkg: UDSPackage) {
  const metadata = pkg.metadata!;
  const { namespace, name, deletionTimestamp } = metadata;

  // Handle deletions of packages, these will have a deletionTimestamp since we have a finalizer
  if (deletionTimestamp) {
    if (pkg.status?.phase !== Phase.Removing) {
      await removePackage(pkg);
      return;
    } else {
      log.trace(pkg, `Deletion already in progress, skipping.`)
      return;
    }
  }

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
    const monitors: string[] = [];
    if (!UDSConfig.isSingleTest) {
      monitors.push(...(await podMonitor(pkg, namespace!)));
      monitors.push(...(await serviceMonitor(pkg, namespace!)));
    } else {
      log.warn(`Running in single test mode, skipping ${name} Monitors.`);
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

async function removePackage(pkg: UDSPackage) {
  // Update status to indicate removal in progress
  await updateStatus(pkg, { phase: Phase.Removing });

  // Cleanup the namespace
  await cleanupNamespace(pkg);

  // Remove any SSO clients
  await purgeSSOClients(pkg, []);
  await purgeAuthserviceClients(pkg, []);

  // Remove Finalizer
  await handleFinalizer(pkg, FinalizerOperation.Remove);
}
