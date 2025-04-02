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
import { generateAuthorizationPolicies } from "../controllers/network/authorizationPolicies";
import { networkPolicies } from "../controllers/network/policies";
import { retryWithDelay } from "../controllers/utils";
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

    const authPol = await generateAuthorizationPolicies(pkg, namespace!);

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

    // Configure the ServiceMonitors
    const monitors: string[] = [];
    monitors.push(...(await podMonitor(pkg, namespace!)));
    monitors.push(...(await serviceMonitor(pkg, namespace!)));

    await updateStatus(pkg, {
      phase: Phase.Ready,
      conditions: getReadinessConditions(true),
      ssoClients: [...ssoClients.keys()],
      authserviceClients,
      endpoints,
      monitors,
      networkPolicyCount: netPol.length,
      authorizationPolicyCount: authPol.length + authserviceClients.length * 2,
      observedGeneration: metadata.generation,
      retryAttempt: 0, // todo: make this nullable when kfc generates the type
    });
  } catch (err) {
    void handleFailure(err, pkg);
  }
}

/**
 * The finalizer is called when an update with a deletion timestamp happens.
 * This function removes any SSO/Authservice clients and ensures that Istio Injection is restored to the original state.
 * Return values indicate whether the finalizer should be removed from the CR based on failure or success of cleanup.
 *
 * @param pkg the package to finalize
 */
export async function packageFinalizer(pkg: UDSPackage) {
  // Skip running the finalizer if it is already running
  if (pkg.status?.phase === Phase.Removing || pkg.status?.phase === Phase.RemovalFailed) {
    // Trace log since this can be confusing when the finalizer hits quickly for the status patch
    log.trace(
      `Skipping finalizer for ${pkg.metadata?.namespace}/${pkg.metadata?.name}, removal already in progress or failed.`,
    );
    return false;
  }

  // Skip running the finalizer if the CR has not completed initial reconciliation - running this during reconciliation can lead to orphaned resources and failed cleanup
  if (pkg.status?.phase !== Phase.Ready && pkg.status?.phase !== Phase.Failed) {
    log.debug(
      `Waiting to finalize package ${pkg.metadata?.namespace}/${pkg.metadata?.name}, package has not completed initial reconciliation.`,
    );
    return false;
  }

  log.debug(`Processing removal of package ${pkg.metadata?.namespace}/${pkg.metadata?.name}`);

  // Update Package to indicate removal in progress
  await updateStatus(pkg, { phase: Phase.Removing });

  // Cleanup Istio status on namespace
  try {
    await writeEvent(pkg, {
      message: `Restoring original Istio injection status on namespace`,
      reason: "RemovalInProgress",
      type: "Normal",
    });
    // Cleanup the namespace - retry on failure
    await retryWithDelay(async function cleanupIstioConfig() {
      return cleanupNamespace(pkg);
    }, log);
  } catch (e) {
    log.debug(
      `Restoration of Istio injection status during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Restoration of Istio injection status failed: ${e.message}. Istio status must be manually restored, by updating or deleting the istio-injection label and cycling pods.`,
      reason: "RemovalFailed",
      type: "Warning",
    });
    await updateStatus(pkg, { phase: Phase.RemovalFailed });
    return false;
  }

  // Cleanup AuthService Clients
  try {
    await writeEvent(pkg, {
      message: `Removing AuthService configuration for package`,
      reason: "RemovalInProgress",
      type: "Normal",
    });
    // Remove any Authservice configuration - retry on failure
    await retryWithDelay(async function cleanupAuthserviceConfig() {
      return purgeAuthserviceClients(pkg, []);
    }, log);
  } catch (e) {
    log.debug(
      `Removal of AuthService configuration during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Removal of AuthService configuration failed: ${e.message}. AuthService configuration secret should be reviewed and cleaned up as needed.`,
      reason: "RemovalFailed",
      type: "Warning",
    });
    await updateStatus(pkg, { phase: Phase.RemovalFailed });
    return false;
  }

  // Cleanup SSO Clients
  try {
    await writeEvent(pkg, {
      message: `Removing SSO clients for package`,
      reason: "RemovalInProgress",
      type: "Normal",
    });
    // Remove any SSO clients - retry on failure
    await retryWithDelay(async function cleanupSSOClients() {
      return purgeSSOClients(pkg, []);
    }, log);
  } catch (e) {
    log.debug(
      `Removal of SSO clients during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Removal of SSO clients failed: ${e.message}. Clients must be manually removed from Keycloak.`,
      reason: "RemovalFailed",
      type: "Warning",
    });
    await updateStatus(pkg, { phase: Phase.RemovalFailed });
    return false;
  }

  // Indicate success - all other resources (network policies, virtual services, etc) are cleaned up through owner references
  // See https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/#ownership-and-finalizers
  log.debug(`Package ${pkg.metadata?.namespace}/${pkg.metadata?.name} removed successfully`);
  return true;
}
