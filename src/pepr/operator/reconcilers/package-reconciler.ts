/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { getReadinessConditions, handleFailure, shouldSkip, updateStatus, writeEvent } from ".";
import { UDSConfig } from "../../config";
import { Component, setupLogger } from "../../logger";
import { cleanupNamespace, enableInjection } from "../controllers/istio/injection";
import { istioResources } from "../controllers/istio/istio-resources";
import {
  authservice,
  purgeAuthserviceClients,
} from "../controllers/keycloak/authservice/authservice";
import { keycloak, purgeSSOClients } from "../controllers/keycloak/client-sync";
import { Client } from "../controllers/keycloak/types";
import { podMonitor } from "../controllers/monitoring/pod-monitor";
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

  if (pkg.status?.retryAttempt && pkg.status?.retryAttempt > 0) {
    // calculate exponential backoff where backoffSeconds = 3^retryAttempt
    const backOffSeconds = 3 ** pkg.status?.retryAttempt;

    log.info(
      metadata,
      `Waiting ${backOffSeconds} seconds before processing package ${namespace}/${name}, status.phase: ${pkg.status?.phase}, observedGeneration: ${pkg.status?.observedGeneration}, retryAttempt: ${pkg.status?.retryAttempt}`,
    );

    await writeEvent(pkg, {
      message: `Waiting ${backOffSeconds} seconds before retrying package`,
    });

    // wait for backOff seconds before retrying
    await new Promise(resolve => setTimeout(resolve, backOffSeconds * 1000));
  }

  // Migrate the package to the latest version
  migrate(pkg);

  // Configure the namespace and namespace-wide network policies
  try {
    await updateStatus(pkg, { phase: Phase.Pending, conditions: getReadinessConditions(false) });

    const netPol = await networkPolicies(pkg, namespace!);

    let endpoints: string[] = [];
    // Update the namespace to ensure the istio-injection label is set
    await enableInjection(pkg);

    let ssoClients = new Map<string, Client>();
    let authserviceClients: string[] = [];

    if (UDSConfig.isIdentityDeployed) {
      // Configure SSO
      ssoClients = await keycloak(pkg);
      authserviceClients = await authservice(pkg, ssoClients);
    } else if (pkg.spec?.sso) {
      log.error("Identity & Authorization is not deployed, but the package has SSO configuration");
      throw new Error(
        "Identity & Authorization is not deployed, but the package has SSO configuration",
      );
    }

    // Create the VirtualService and ServiceEntry for each exposed service
    endpoints = await istioResources(pkg, namespace!);

    // Create the egress resources
    // Check if there's an egress gateway first, if not skip
    // exposedHosts = await egressResources(pkg, namespace!);

    // Configure the ServiceMonitors
    const monitors: string[] = [];
    monitors.push(...(await podMonitor(pkg, namespace!)));
    monitors.push(...(await serviceMonitor(pkg, namespace!)));

    // TODO: add status field for exposedHosts
    await updateStatus(pkg, {
      phase: Phase.Ready,
      conditions: getReadinessConditions(true),
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

/**
 * The finalizer is called when an update with a deletion timestamp happens.
 * On completion the finalizer is removed from the Package CR.
 * This function removes any SSO/Authservice clients and ensures that Istio Injection is restored to the original state.
 *
 * @param pkg the package to finalize
 */
export async function packageFinalizer(pkg: UDSPackage) {
  log.debug(`Processing removal of package ${pkg.metadata?.namespace}/${pkg.metadata?.name}`);

  // In order to avoid triggering a second call of this finalizer, we just write events for each removal piece
  // This could be switched to updateStatus once https://github.com/defenseunicorns/pepr/issues/1316 is resolved
  // await updateStatus(pkg, { phase: Phase.Removing });

  try {
    await writeEvent(pkg, {
      message: `Restoring original istio injection status on namespace`,
      reason: "RemovalInProgress",
      type: "Normal",
    });
    // Cleanup the namespace
    await cleanupNamespace(pkg);
  } catch (e) {
    log.debug(
      `Restoration of istio injection status during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Restoration of istio injection status failed: ${e.message}`,
      reason: "RemovalFailed",
    });
  }

  try {
    await writeEvent(pkg, {
      message: `Removing SSO / AuthService clients for package`,
      reason: "RemovalInProgress",
      type: "Normal",
    });
    // Remove any SSO clients
    await purgeSSOClients(pkg, []);
    await purgeAuthserviceClients(pkg, []);
  } catch (e) {
    log.debug(
      `Removal of SSO / AuthService clients during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Removal of SSO / AuthService clients failed: ${e.message}`,
      reason: "RemovalFailed",
    });
  }

  log.debug(`Package ${pkg.metadata?.namespace}/${pkg.metadata?.name} removed successfully`);
}
