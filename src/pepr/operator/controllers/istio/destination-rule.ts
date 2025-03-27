/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { IstioDestinationRule } from "../../crd";
import { DestinationRule } from "../../crd/generated/istio/destinationrule-v1";
import {
  getSharedAnnotationKey,
  istioEgressGatewayNamespace,
  log,
  sharedResourcesAnnotationPrefix,
} from "./istio-resources";

const destinationRuleName = "egressgateway-destination-rule";
export const subsetName = "egressgateway-subset";

/**
 * Find existing destination rule, generating if needed or patches annotations
 *
 * @param pkgId
 * @param attempt
 */
export async function generateOrPatchDestinationRule(
  pkgId: string,
  attempt: number = 0, // Add attempt counter
  maxAttempts: number = 3, // Maximum number of attempts to reconcile
) {
  // Retrieve the existing DestinationRule matching the sharedResourceId
  await K8s(IstioDestinationRule)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(destinationRuleName)
    .then(async dr => {
      // Add the package annotation if not found
      const annotations = dr.metadata?.annotations || {};
      const pkgKey = getSharedAnnotationKey(pkgId);
      if (!Object.keys(annotations).find(key => key == pkgKey)) {
        annotations[`${pkgKey}`] = "user";
        await patchDestinationRuleAnnotations(dr, annotations);
      }
    })
    .catch(async err => {
      if (err.status === 404) {
        // Create a new DestinationRule if not found
        log.debug(`Creating new destination rule ${destinationRuleName}.`);
        const newDr = generateDestinationRule(pkgId);

        await K8s(IstioDestinationRule)
          .Create(newDr)
          .catch(async err => {
            log.error(
              `Failed to create Destination Rule ${destinationRuleName}: ${JSON.stringify(err)}. Attempt ${attempt + 1} of ${maxAttempts}.`,
            );
            if (attempt + 1 >= maxAttempts) {
              throw new Error(
                `Failed to create Destination Rule ${destinationRuleName} after ${maxAttempts} attempts.`,
              );
            }
            return await generateOrPatchDestinationRule(pkgId, attempt + 1);
          });
      } else {
        // Retry if the error is not a 404
        if (attempt < maxAttempts) {
          log.warn(
            `Failed to get destination rule ${destinationRuleName}. Attempt ${attempt + 1} of ${maxAttempts}.`,
          );
          await generateOrPatchDestinationRule(pkgId, attempt + 1);
        } else {
          log.error(
            `Failed to get Destination Rule ${destinationRuleName} after ${maxAttempts} attempts.`,
          );
        }
      }
    });
}

export async function cleanupEgressDestinationRule(
  pkgId: string,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  await K8s(IstioDestinationRule)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(destinationRuleName)
    .then(async dr => {
      // Get the sharedResourcesAnnotation annotation
      const annotations = dr.metadata?.annotations || {};

      // Remove the package annotation
      delete annotations[`${getSharedAnnotationKey(pkgId)}`];

      // If there are no more UDS Package annotations, remove the resource
      if (!Object.keys(annotations).find(key => key.startsWith(sharedResourcesAnnotationPrefix))) {
        await K8s(IstioDestinationRule)
          .InNamespace(istioEgressGatewayNamespace)
          .Delete(destinationRuleName);
      } else {
        // Patch the destination rule annotations
        await patchDestinationRuleAnnotations(dr, annotations);
      }
    })
    .catch(async err => {
      if (err.status === 404) {
        log.debug(`Gateway ${destinationRuleName} not found.`);
        return;
      } else {
        log.error(
          `Failed to cleanup Destination Rule ${destinationRuleName}. Attempt ${attempt + 1} of ${maxAttempts}.`,
        );
        if (attempt + 1 >= maxAttempts) {
          throw new Error(
            `Failed to cleanup Destination Rule ${destinationRuleName} after ${maxAttempts} attempts.`,
          );
        }
        return await cleanupEgressDestinationRule(pkgId, attempt + 1, maxAttempts);
      }
    });
}

// Recursive function to patch the destination rule annotation with the package ID
export async function patchDestinationRuleAnnotations(
  dr: DestinationRule,
  annotations: Record<string, string>,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  await K8s(DestinationRule, { name: dr.metadata?.name, namespace: dr.metadata?.namespace })
    .Patch([
      {
        op: "replace",
        path: "/metadata/annotations",
        value: annotations,
      },
    ])
    .catch(async () => {
      log.error(
        `Failed to patch Destination Rule annotations for ${dr.metadata?.name}. Attempt ${attempt + 1} of ${maxAttempts}.`,
      );
      if (attempt + 1 >= maxAttempts) {
        throw new Error(
          `Failed to patch Destination Rule annotations for ${dr.metadata?.name} after ${maxAttempts} attempts.`,
        );
      }
      return await patchDestinationRuleAnnotations(dr, annotations, attempt + 1, maxAttempts);
    });
}

function generateDestinationRule(pkgId: string) {
  const destinationRule: DestinationRule = {
    metadata: {
      name: destinationRuleName,
      namespace: istioEgressGatewayNamespace,
      annotations: {
        [`${getSharedAnnotationKey(pkgId)}`]: "user",
      },
    },
    spec: {
      host: `egressgateway.${istioEgressGatewayNamespace}.svc.cluster.local`,
      subsets: [
        {
          name: subsetName,
        },
      ],
    },
  };

  return destinationRule;
}
