import { GenericKind } from "kubernetes-fluent-client";
import { K8s, Log, kind } from "pepr";

import { ExemptStatus, Phase, PkgStatus, UDSExemption, UDSPackage } from "../crd";
import { Status } from "../crd/generated/package-v1alpha1";

export const uidSeen = new Set<string>();

/**
 * Checks if the CRD is pending or the current generation has been processed
 *
 * @param cr The custom resource to check
 * @returns true if the CRD is pending or the current generation has been processed
 */
export function shouldSkip(cr: UDSExemption | UDSPackage) {
  const isPending = cr.status?.phase === Phase.Pending;
  const isCurrentGeneration = cr.metadata?.generation === cr.status?.observedGeneration;

  // First check if the CR has been seen before and return false if it has not
  // This ensures that all CRs are processed at least once by this version of pepr-core
  if (!uidSeen.has(cr.metadata!.uid!)) {
    Log.debug(cr, `Should skip? No, first time processed during this pod's lifetime`);
    return false;
  }

  // This is the second time the CR has been seen, so check if it is pending or the current generation
  if (isPending || isCurrentGeneration) {
    Log.debug(cr, `Should skip? Yes, pending or current generation and not first time seen`);
    return true;
  }

  Log.debug(cr, `Should skip? No, not pending or current generation and not first time seen`);

  return false;
}

/**
 * Updates the status of the package
 *
 * @param cr The custom resource to update
 * @param status The new status
 */
export async function updateStatus(cr: GenericKind, status: PkgStatus | ExemptStatus) {
  const model = cr.kind === "Package" ? UDSPackage : UDSExemption;
  Log.debug(cr.metadata, `Updating status to ${status.phase}`);

  // Update the status of the CRD
  await K8s(model).PatchStatus({
    metadata: {
      name: cr.metadata!.name,
      namespace: cr.metadata!.namespace,
    },
    status,
  });
}

/**
 * Write a K8s event for the CRD
 *
 * @param cr The custom resource to write the event for
 * @param message A human-readable message for the event
 * @param type The type of event to write
 */
export async function writeEvent(cr: GenericKind, event: Partial<kind.CoreEvent>) {
  Log.debug(cr.metadata, `Writing event: ${event.message}`);

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
  err: { status: number; message: string },
  cr: UDSPackage | UDSExemption,
) {
  const metadata = cr.metadata!;
  const identifier = `${metadata.namespace}/${metadata.name}`;
  let status: Status;

  // todo: identify exact 404 we are targetting, possibly in `updateStatus`
  if (err.status === 404) {
    Log.warn({ err }, `Package metadata seems to have been deleted`);
    return;
  }

  const retryAttempt = cr.status?.retryAttempt || 0;

  if (retryAttempt < 5) {
    const currRetry = retryAttempt + 1;
    Log.error({ err }, `Reconciliation attempt ${currRetry} failed for ${identifier}, retrying...`);

    status = {
      retryAttempt: currRetry,
    };
  } else {
    Log.error({ err }, `Error configuring ${identifier}, maxed out retries`);

    status = {
      phase: Phase.Failed,
      observedGeneration: metadata.generation,
    };
  }

  // Write an event for the error
  void writeEvent(cr, { message: err.message });

  // Update the status of the package with the error
  updateStatus(cr, status).catch(finalErr => {
    // If the status update fails, write log the error and and try to write an event
    Log.error({ err: finalErr }, `Error updating status for ${identifier} failed`);
    void writeEvent(cr, { message: finalErr.message });
  });
}
