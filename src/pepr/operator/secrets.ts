/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import {
  a,
  K8s,
  kind,
  Log,
  PeprMutateRequest,
  PeprValidateRequest,
} from "pepr";
import { ValidateActionResponse } from "pepr/dist/lib/types";

export const labelCopySecret = "secrets.uds.dev/copy";
const labelCopiedSecret = "secrets.uds.dev/copied";

const annotationFromNS = "secrets.uds.dev/fromNamespace";
const annotationFromName = "secrets.uds.dev/fromName";
const annotationOnFailure = "secrets.uds.dev/onMissingSource";

/**
 * Enum for handling what to do when the source secret is missing
 *
 * This can be one of the following:
 * - Deny: Fail to create the destination secret
 * - LeaveEmpty: Create the destination secret with no data
 */
enum OnFailure {
  DENY,
  LEAVEEMPTY,
}

/**
 * Enum for reasons a secret copy may fail
 */
enum FailReason {
  NO_ANNOTATIONS,
  MISSING_ANNOTATIONS,
  MISSING_METADATA,
  SOURCE_NOT_FOUND,
  OK,
}

/**
 * Check required annotations and metadata for a secret copy
 */
export function checkAnnotationsAndMetadata(data: a.Secret): FailReason {
  const annotations = data.metadata?.annotations;

  if (!annotations) {
    return FailReason.NO_ANNOTATIONS;
  }

  if (!annotations[annotationFromNS] || !annotations[annotationFromName]) {
    return FailReason.MISSING_ANNOTATIONS;
  }

  if (!data.metadata?.namespace || !data.metadata?.name) {
    return FailReason.MISSING_METADATA;
  }

  return FailReason.OK;
}

/**
 * Copy a secret from one namespace to another
 *
 * @remarks
 * This function is a PeprMutateRequest handler that copies a secret from one
 * namespace to another. It looks for a set of annotations on this _destination_
 * secret, with the source namespace and name from which to copy the secret
 * data.
 *
 * If the source secret does not exist, the behavior is determined by the
 * `uds.dev/secrets/onMissingSource` annotation. If this annotation is not
 * present, the default behavior is "Deny", which will log an error and return
 * without creating a destination secret. The other option is "LeaveEmpty" which
 * will create the destination secret with desired name in the desired
 * namespace, but with no data. This may be useful if a secret is expected to
 * exist, but is not critical to the operation of the application.
 *
 * This function will remove the `secrets.uds.dev/copy` label from the secret
 * and replace it with `secrets.uds.dev/copied` with the value "true" if the
 * secret was successfully copied, or "empty" if the secret was created with no
 * data. If the source secret was not found and the behavior is "Deny", the
 * label will be set to "deny", and the secret will be denied in the validation
 * step after this.
 *
 * @param request The PeprMutateRequest on a Secret. This should have been
 *  triggered by a secret with the appropriate label.
 * @returns Promise<void>
 *
 **/
export async function copySecret(request: PeprMutateRequest<a.Secret>) {
  const annotations = request.Raw.metadata?.annotations;

  if (checkAnnotationsAndMetadata(request.Raw) !== FailReason.OK) {
    // if there are no annotations, we can't do anything, we'll deny.
    // in the validation step, the missing annotations will be noticed and an
    // appropriate error message generated.
    request.RemoveLabel(labelCopySecret);
    request.SetLabel(labelCopiedSecret, "deny");
    throw "Missing annotations";
  }

  const fromNS = annotations[annotationFromNS];
  const fromName = annotations[annotationFromName];
  const toNS = request.Raw.metadata?.namespace;
  const toName = request.Raw.metadata?.name;

  let failBehavior: OnFailure;

  if (!annotations[annotationOnFailure]) {
    failBehavior = OnFailure.DENY;
  } else {
    switch (annotations[annotationOnFailure].toUpperCase()) {
      case "LEAVEEMPTY":
        failBehavior = OnFailure.LEAVEEMPTY;
        break;
      case "DENY":
      default:
        failBehavior = OnFailure.DENY;
        break;
    }
  }

  if (!fromNS || !fromName || !toNS || !toName) {
    // if any of the required annotations or metadata are blank, deny.
    request.RemoveLabel(labelCopySecret);
    request.SetLabel(labelCopiedSecret, "deny");
    throw "Missing annotations";
    return;
  }

  Log.info(
    "Attempting to copy secret %s from namespace %s to %s",
    fromName,
    fromNS,
    toNS,
  );

  let sourceSecret = null;

  try {
    sourceSecret = await K8s(kind.Secret).InNamespace(fromNS).Get(fromName);
  } catch (error) {
    sourceSecret = null;
    Log.info(
      "Source secret %s/%s not found when copy to %s/%s: %s",
      fromNS,
      fromName,
      toNS,
      toName,
      error.message,
    );
  }

  if (!sourceSecret) {
    // if the source secret does not exist, handle according to the failure behavior
    switch (failBehavior) {
      case OnFailure.LEAVEEMPTY:
        Log.info("Creating empty secret %s/%s", toNS, toName);

        request.RemoveLabel(labelCopySecret);
        request.SetLabel(labelCopiedSecret, "empty");
        request.Raw.data = {};
        return;
      case OnFailure.DENY:
        request.SetLabel(labelCopiedSecret, "deny");
        throw `Source secret ${fromNS}/${fromName} not found`;
    }
  } else {
    // fill in destination secret with source data
    request.RemoveLabel(labelCopySecret);
    request.SetLabel(labelCopiedSecret, "true");
    request.Raw.data = sourceSecret.data;
  }
}

/**
 * Provide final validation for a secret copy request. In some cases we don't
 * want to copy secrets, so we can deny the request here.
 *
 * @param request
 * @returns Approve, or Deny w/ message
 */
export function validateSecret(
  request: PeprValidateRequest<a.Secret>,
): ValidateActionResponse {
  const result = checkAnnotationsAndMetadata(request.Raw);

  console.log("**** VALIDATE REQUEST *****: ", JSON.stringify(request.Raw));

  if (result === FailReason.NO_ANNOTATIONS) {
    return request.Deny(
      "Missing all annotations (requires secrets.uds.dev/fromNamespace and fromName)",
    );
  }

  if (result === FailReason.MISSING_ANNOTATIONS) {
    return request.Deny(
      "Missing secrets.uds.dev/fromNamespace and/or secrets.uds.dev/fromName annotations",
    );
  }

  if (
    checkAnnotationsAndMetadata(request.Raw) === FailReason.MISSING_METADATA
  ) {
    return request.Deny("Source secret not found, denying the request");
  }

  return request.Approve();
}
