/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { getReadinessConditions, handleFailure, shouldSkip, updateStatus, writeEvent } from ".";
import { UDSConfig } from "../../config";
import { Component, setupLogger } from "../../logger";
import {
  isAmbientEnabled,
  setupAmbientWaypoint,
  unregisterAmbientPackage,
} from "../controllers/istio/ambient-waypoint";
import { reconcileSharedEgressResources } from "../controllers/istio/egress";
import { getPackageId, istioResources } from "../controllers/istio/istio-resources";
import { cleanupNamespace, enableIstio } from "../controllers/istio/namespace";
import { PackageAction } from "../controllers/istio/types";
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
import { Condition, Mode, StatusEnum } from "../crd/generated/package-v1alpha1";
import { migrate } from "../crd/migrate";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_RECONCILERS);

/**
 * The reconciler is called from the queue and is responsible for reconciling the state of the package
 * with the cluster. This includes creating the network policies, virtual services, sso, and monitoring config.
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

    // Get the requested service mesh mode, default to sidecar if not specified
    const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar;

    // Pass the effective Istio mode to the networkPolicies function
    const netPol = await networkPolicies(pkg, namespace!, istioMode);

    const authPol = await generateAuthorizationPolicies(pkg, namespace!, istioMode);

    let endpoints: string[] = [];
    // Update the namespace to enable the expected Istio mode (sidecar or ambient)
    await enableIstio(pkg);

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

    // Create the Istio Resources per the package configuration
    endpoints = await istioResources(pkg, namespace!);

    // Configure the ServiceMonitors
    const monitors: string[] = [];
    monitors.push(...(await podMonitor(pkg, namespace!)));
    monitors.push(...(await serviceMonitor(pkg, namespace!)));

    // Handle ambient waypoint if needed
    if (pkg.spec?.sso) {
      const hasAuthService = pkg.spec.sso.some(sso => sso.enableAuthserviceSelector);
      const isAmbient = await isAmbientEnabled(namespace!);

      try {
        if (isAmbient && hasAuthService) {
          // Get the first client ID that has authservice enabled
          const authServiceClient = pkg.spec.sso.find(sso => sso.enableAuthserviceSelector);

          // Set up the ambient waypoint with proper two-phase activation
          await setupAmbientWaypoint(pkg, authServiceClient!.clientId);

          // Update package status with waypoint information
          const now = new Date();
          const conditions: Condition[] = [
            ...(pkg.status?.conditions || []).filter(c => c.type !== "WaypointReady"),
            {
              type: "WaypointReady",
              status: StatusEnum.True,
              reason: "WaypointProvisioned",
              message: "Ambient waypoint is ready for service traffic",
              lastTransitionTime: now,
            },
          ];

          await updateStatus(pkg, { conditions });
        } else {
          // Check if we need to clean up any existing waypoint
          const currentKey =
            pkg.metadata?.namespace && pkg.metadata?.name
              ? `${pkg.metadata.namespace}/${pkg.metadata.name}`
              : null;

          if (currentKey) {
            // Get the first client ID that has authservice enabled for cleanup
            if (pkg.spec?.sso) {
              const authServiceClient = pkg.spec.sso.find(sso => sso.enableAuthserviceSelector);
              if (authServiceClient) {
                await unregisterAmbientPackage(pkg, authServiceClient.clientId);
              } else {
                // If no auth service client is found, try to clean up with the package name as fallback
                await unregisterAmbientPackage(pkg, pkg.metadata?.name || "");
              }
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : "No stack trace available";
        const errorDetails = {
          error: errorMessage,
          stack: errorStack,
          packageName: pkg.metadata?.name,
          namespace: pkg.metadata?.namespace,
          phase: pkg.status?.phase,
          conditions: pkg.status?.conditions,
        };
        log.error("Error configuring ambient auth", errorDetails);
        throw new Error(`Failed to configure ambient auth: ${errorMessage}`);
      }
    }

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

  // Clean up ambient waypoint registration
  try {
    await writeEvent(pkg, {
      message: "Removing package from ambient waypoint registration",
      reason: "RemovalInProgress",
      type: "Normal",
    });
    log.info(
      `Unregistering package ${pkg.metadata?.namespace}/${pkg.metadata?.name} from ambient waypoint`,
    );
    // Get the first client ID that has authservice enabled for cleanup
    if (pkg.spec?.sso) {
      const authServiceClient = pkg.spec.sso.find(sso => sso.enableAuthserviceSelector);
      if (authServiceClient) {
        await unregisterAmbientPackage(pkg, authServiceClient.clientId);
      } else {
        // If no auth service client is found, try to clean up with the package name as fallback
        await unregisterAmbientPackage(pkg, pkg.metadata?.name || "");
      }
    } else {
      // If no SSO config is found, try to clean up with the package name as fallback
      await unregisterAmbientPackage(pkg, pkg.metadata?.name || "");
    }
  } catch (e) {
    log.debug(
      `Removal of ambient waypoint registration during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Removal of ambient waypoint registration failed: ${e.message}. Manual cleanup may be required.`,
      reason: "RemovalFailed",
      type: "Warning",
    });
    await updateStatus(pkg, { phase: Phase.RemovalFailed });
    return false;
  }

  // Clean up any shared egress resources
  try {
    await writeEvent(pkg, {
      message: `Reconciling any shared egress resources`,
      reason: "RemovalInProgress",
      type: "Normal",
    });
    // Clean annotations and/or remove any shared egress resources
    await retryWithDelay(async function cleanupSharedEgressResources() {
      await reconcileSharedEgressResources(undefined, getPackageId(pkg), PackageAction.Remove);
    }, log);
  } catch (e) {
    log.debug(
      `Removal of shared egress resources during finalizer failed for ${pkg.metadata?.namespace}/${pkg.metadata?.name}: ${e.message}`,
    );
    await writeEvent(pkg, {
      message: `Removal of shared egress resources failed: ${e.message}`,
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
