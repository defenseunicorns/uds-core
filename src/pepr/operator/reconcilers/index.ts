/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { GenericKind } from "kubernetes-fluent-client";
import { Component, setupLogger } from "../../logger.js";
import {
  AuthserviceClient,
  StatusObject as Status,
  StatusEnum,
} from "../crd/generated/package-v1alpha1.js";
import { Phase, PkgStatus, UDSPackage } from "../crd/index.js";
import { buildMigratedAuthserviceStatus } from "../crd/migrate.js";

export const uidSeen = new Set<string>();

// configure subproject logger
const log = setupLogger(Component.OPERATOR_RECONCILERS);

/**
 * Checks if the CRD is pending or the current generation has been processed
 *
 * @param cr The custom resource to check
 * @returns true if the CRD is removing, pending, or the current generation has already been processed
 */
export function shouldSkip(cr: UDSPackage) {
  const isRetrying = cr.status?.phase === Phase.Retrying;
  const isPending = cr.status?.phase === Phase.Pending;
  // Check for status removing OR a deletion timestamp present
  const isRemoving =
    cr.metadata?.deletionTimestamp ||
    cr.status?.phase === Phase.Removing ||
    cr.status?.phase === Phase.RemovalFailed;
  const isCurrentGeneration = cr.metadata?.generation === cr.status?.observedGeneration;

  // First check if the CR has been seen before and return false if it has not
  // This ensures that all CRs are processed at least once by this version of pepr-core
  if (!uidSeen.has(cr.metadata!.uid!)) {
    log.trace(cr, `Should skip? No, first time processed during this pod's lifetime`);
    return false;
  }

  // If the CR is retrying, it should not be skipped
  if (isRetrying) {
    log.debug(cr, `Should skip? No, retrying`);
    return false;
  }

  // If the CR is removing, it should be skipped
  if (isRemoving) {
    log.debug(cr, `Should skip? Yes, removing`);
    return true;
  }

  // This is the second time the CR has been seen, so check if it is pending or the current generation
  if (isPending || isCurrentGeneration) {
    log.trace(cr, `Should skip? Yes, pending or current generation and not first time seen`);
    return true;
  }

  log.trace(cr, `Should skip? No, not pending or current generation and not first time seen`);

  return false;
}

/**
 * Updates the status of the package
 *
 * @param cr The custom resource to update
 * @param status The new status
 */
export async function updateStatus(cr: UDSPackage, status: PkgStatus) {
  log.debug(`Updating ${cr.metadata?.name}/${cr.metadata?.namespace} status to ${status.phase}`);

  // Migrate legacy fields before patching status to satisfy CRD validation
  // Specifically, older packages stored authserviceClients as string[]; new schema expects object[]
  const migratedStatus: PkgStatus & { authserviceClients?: AuthserviceClient[] } = { ...status };
  const normalized = buildMigratedAuthserviceStatus(cr);
  if (normalized) {
    migratedStatus.authserviceClients = normalized;
  }

  // Update the status of the CRD
  await K8s(UDSPackage).PatchStatus({
    metadata: {
      name: cr.metadata!.name,
      namespace: cr.metadata!.namespace,
    },
    status: migratedStatus,
  });

  // Track the UID of the CRD to know if it has been seen before
  uidSeen.add(cr.metadata!.uid!);
}

/**
 * Write a K8s event for the CRD
 *
 * @param cr The custom resource to write the event for
 * @param message A human-readable message for the event
 * @param type The type of event to write
 */
export async function writeEvent(cr: GenericKind, event: Partial<kind.CoreEvent>) {
  log.debug(`Writing ${cr.metadata?.name}/${cr.metadata?.namespace} event: ${event.message}`);

  await K8s(kind.CoreEvent).Create({
    type: "Warning",
    reason: "ReconciliationFailed",
    ...event,
    // Fixed values
    metadata: {
      namespace: cr.metadata!.namespace,
      generateName: cr.metadata!.name,
    },
    involvedObject: {
      apiVersion: cr.apiVersion,
      kind: cr.kind,
      name: cr.metadata!.name,
      namespace: cr.metadata!.namespace,
      uid: cr.metadata!.uid,
    },
    firstTimestamp: new Date(),
    reportingComponent: "uds.dev/operator",
    reportingInstance: process.env.HOSTNAME,
  });
}

/**
 * Handles a failure by updating the status of the CRD and writing an event
 *
 * @param err The error-like object
 * @param cr The custom resource that failed
 */
export async function handleFailure(
  err: { status: number; message: string; data?: { message?: string; reason?: string } },
  cr: UDSPackage,
) {
  const metadata = cr.metadata!;
  const identifier = `${metadata.namespace}/${metadata.name}`;
  let status: Status;

  // todo: identify exact 404 we are targeting, possibly in `updateStatus`
  if (err.status === 404) {
    log.warn({ err }, `Package metadata seems to have been deleted`);
    return;
  }

  // Extract the most detailed error message available
  const detailedMessage = err.data?.message || err.message;

  const retryAttempt = cr.status?.retryAttempt || 0;

  // retryAttempt starts at 0, we perform 4 retries, 5 total attempts
  if (retryAttempt < 4) {
    const currRetry = retryAttempt + 1;
    log.error({ err }, `Reconciliation attempt ${currRetry} failed for ${identifier}, retrying...`);

    status = {
      phase: Phase.Retrying,
      conditions: getReadinessConditions(false),
      retryAttempt: currRetry,
    };
  } else {
    log.error({ err }, `Error configuring ${identifier}, maxed out retries`);

    status = {
      phase: Phase.Failed,
      conditions: getReadinessConditions(false),
      observedGeneration: metadata.generation,
      retryAttempt: 0, // todo: make this nullable when kfc generates the type
    };
  }

  // Write an event for the error with the most detailed message available
  await writeEvent(cr, { message: detailedMessage });

  // Update the status of the package with the error
  updateStatus(cr, status).catch(finalErr => {
    // If the status update fails, write log the error and and try to write an event
    log.error({ err: finalErr }, `Error updating status for ${identifier} failed`);
    void writeEvent(cr, { message: finalErr.message });
  });
}

export function getReadinessConditions(ready: boolean = true) {
  return [
    {
      type: "Ready",
      status: ready === true ? StatusEnum.True : StatusEnum.False,
      lastTransitionTime: new Date(),
      message:
        ready === true ? "The package is ready for use." : "The package is not ready for use.",
      reason: "ReconciliationComplete",
    },
  ];
}
