import { a, K8s, kind, Log, PeprMutateRequest } from "pepr";

<<<<<<< HEAD
export const labelCopySecret = "secrets.uds.dev/copy";

const annotationFromNS = "secrets.uds.dev/fromNamespace";
const annotationFromName = "secrets.uds.dev/fromName";
const annotationOnFailure = "secrets.uds.dev/onMissingSource";

/**
 * Enum for handling what to do when the source secret is missing
 *
=======
export const labelCopySecret = "uds.dev/secrets/copy";

const annotationFromNS = "uds.dev/secrets/fromNamespace";
const annotationFromName = "uds.dev/secrets/fromName";
const annotationOnFailure = "uds.dev/secrets/onMissingSource";

/** 
 * Enum for handling what to do when the source secret is missing
 * 
>>>>>>> 2f808c1 (Started on secret watch/mutator)
 * This can be one of the following:
 * - Ignore: Do nothing
 * - Error: Log an error and return
 * - LeaveEmpty: Create the destination secret with no data
 */
enum OnFailure {
<<<<<<< HEAD
  IGNORE,
  ERROR,
  LEAVEEMPTY,
}

/**
 * Filter unwanted labels based on a list of keys to strip out.
 *
 * @returns Record<string, string> - The filtered labels
 */
function filterLabels(labels: Record<string, string>, keysToRemove: string[]) {
  const filteredLabels: Record<string, string> = {};

  for (const key in labels) {
    if (!keysToRemove.includes(key)) {
      filteredLabels[key] = labels[key];
    }
  }

  return filteredLabels;
=======
    IGNORE,
    ERROR,
    LEAVEEMPTY,
>>>>>>> 2f808c1 (Started on secret watch/mutator)
}

/**
 * Copy a secret from one namespace to another
<<<<<<< HEAD
 *
=======
 * 
>>>>>>> 2f808c1 (Started on secret watch/mutator)
 * @remarks
 * This function is a PeprMutateRequest handler that copies a secret from one
 * namespace to another. It looks for a set of annotations on this _destination_
 * secret, with the source namespace and name from which to copy the secret
 * data.
<<<<<<< HEAD
 *
=======
 * 
>>>>>>> 2f808c1 (Started on secret watch/mutator)
 * If the source secret does not exist, the behavior is determined by the
 * `uds.dev/secrets/onMissingSource` annotation. If this annotation is not
 * present, the default behavior is "Error", which will log an error and return
 * without creating a destination secret. Other options are "Ignore" which will
 * silently do nothing, and "LeaveEmpty" which will create the destination
 * secret with desired name in the desired namespace, but with no data.
<<<<<<< HEAD
 *
=======
 * 
>>>>>>> 2f808c1 (Started on secret watch/mutator)
 * @param request The PeprMutateRequest on a Secret. This should have been
 *  triggered by a secret with the appropriate label.
 * @returns void
 *
 **/
export async function copySecret(request: PeprMutateRequest<a.Secret>) {
<<<<<<< HEAD
  const annotations = request.Raw.metadata?.annotations;

  if (!annotations) {
    Log.error("No annotations present for secret copy %s", request.Raw.metadata?.name);
    return;
  }

  const fromNS = annotations[annotationFromNS];
  const fromName = annotations[annotationFromName];
  const toNS = request.Raw.metadata?.namespace;
  const toName = request.Raw.metadata?.name;

  let failBehavior: OnFailure;

  switch (annotations[annotationOnFailure]) {
    case "Ignore":
      failBehavior = OnFailure.IGNORE;
      break;
    case "LeaveEmpty":
      failBehavior = OnFailure.LEAVEEMPTY;
      break;
    case "Error":
    default:
      failBehavior = OnFailure.ERROR;
      break;
  }

  if (!fromNS || !fromName || !toNS || !toName) {
    Log.error("Missing required annotations for secret copy %s", request.Raw.metadata?.name);
  }

  Log.info("Attempting to copy secret %s from namespace %s to %s", fromName, fromNS, toNS);

  // filter out the original copy label, then add a "copied" label
  let filteredLabels = filterLabels(request.Raw.metadata?.labels || {}, [labelCopySecret]);
  filteredLabels = { ...filteredLabels, "secrets.uds.dev/copied": "true" };

  try {
    const sourceSecret = await K8s(kind.Secret).InNamespace(fromNS).Get(fromName);

    if (!sourceSecret) {
      // if the source secret does not exist, handle according to the failure behavior
      switch (failBehavior) {
        case OnFailure.IGNORE:
          return;
        case OnFailure.LEAVEEMPTY:
          // Create an empty secret in the destination namespace
          await K8s(kind.Secret).Apply({
            apiVersion: "v1",
            kind: "Secret",
            metadata: {
              name: toName,
              namespace: toNS,
              labels: filteredLabels,
              annotations: request.Raw.metadata?.annotations,
            },
          });
          return;
        case OnFailure.ERROR:
          Log.error("Source secret %s not found in namespace %s", fromName, fromNS);
          return;
      }
    } else {
      // fill in destination secret with source data
      await K8s(kind.Secret).Apply({
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: toName,
          namespace: toNS,
          labels: filteredLabels,
          annotations: request.Raw.metadata?.annotations,
        },
        data: sourceSecret.data,
      });
    }
  } catch (error) {
    Log.error("Error copying secret %s from %s to %s: %s", fromName, fromNS, toNS, error);
  }
}
=======
    const annotations = request.Raw.metadata?.annotations;

    if (!annotations) {
        Log.error("No annotations present for secret copy %s", request.Raw.metadata?.name);
        return;
    }

    const fromNS = annotations[annotationFromNS];
    const fromName = annotations[annotationFromName];
    const toNS = request.Raw.metadata?.namespace;
    const toName = request.Raw.metadata?.name;

    let failBehavior: OnFailure;

    switch(annotations[annotationOnFailure]) {
        case "Ignore":
            failBehavior = OnFailure.IGNORE;
            break;
        case "LeaveEmpty":
            failBehavior = OnFailure.LEAVEEMPTY;
            break;
        case "Error":
        default:
            failBehavior = OnFailure.ERROR;
            break;
    }

    if (!fromNS || !fromName || !toNS || !toName) {
        Log.error("Missing required annotations for secret copy %s", request.Raw.metadata?.name);
    }

    Log.info("Attempting to copy secret %s from namespace %s to %s", fromName, fromNS, toNS);

    try {
        const sourceSecret = await K8s(kind.Secret).InNamespace(fromNS).Get(fromName);

        if (!sourceSecret) {
            // if the source secret does not exist, handle according to the failure behavior
            switch(failBehavior) {
                case OnFailure.IGNORE:
                    return;
                case OnFailure.LEAVEEMPTY:
                    // Create an empty secret in the destination namespace
                    await K8s(kind.Secret).Apply({
                        apiVersion: "v1",
                        kind: "Secret",
                        metadata: {
                            namespace: toNS,
                            name: toName,
                        },
                    });
                    return;
                case OnFailure.ERROR:
                    Log.error("Source secret %s not found in namespace %s", fromName, fromNS);
                    return;
            }
        } else {
            // fill in destination secret with source data
            await K8s(kind.Secret).Apply({
                apiVersion: "v1",
                kind: "Secret",
                metadata: {
                    namespace: toNS,
                    name: toName,
                },
                data: sourceSecret.data,
            });
        }

    } catch (error) {
        Log.error("Error copying secret %s from %s to %s: %s", fromName, fromNS, toNS, error);
    }
};

>>>>>>> 2f808c1 (Started on secret watch/mutator)
