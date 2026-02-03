/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesObject } from "kubernetes-fluent-client";
import { PeprMutateRequest, PeprValidateRequest } from "pepr";
import { Component, setupLogger } from "../../logger.js";
import { ExemptionStore } from "../../operator/controllers/exemptions/exemption-store.js";
import { Policy } from "../../operator/crd/index.js";

// configure subproject logger
const log = setupLogger(Component.POLICIES_EXEMPTIONS);

/**
 * Check a resource against an exemption list for use by the validation action.
 *
 * @param policy Policy to get exemptions for
 * @param request The request to check.
 * @returns True if exempt and false otherwise
 */
export function isExempt<T extends KubernetesObject>(
  request: PeprValidateRequest<T> | PeprMutateRequest<T>,
  policy: Policy,
) {
  const exemptList = ExemptionStore.getByPolicy(policy);
  const resourceName = request.Raw.metadata?.name || request.Raw.metadata?.generateName;
  const resourceNamespace = request.Raw.metadata?.namespace;

  if (exemptList.length !== 0) {
    // Debug log to provide current exemptions for policy
    log.debug(
      `Checking ${resourceName} against ${policy} exemptions: ${JSON.stringify(exemptList)}`,
    );
    for (const exempt of exemptList) {
      // If the exempt namespace is specified, check it
      if (exempt.namespace !== resourceNamespace) {
        continue;
      }

      // If the exempt name is specified, check it
      if (!resourceName?.match(exempt.name)) {
        continue;
      }

      // If we get here, the request is exempt
      log.info(`${resourceName} is exempt from ${policy}`);
      return true;
    }
  }

  // No exemptions matched
  return false;
}

export const exemptionAnnotationPrefix = "uds-core.pepr.dev/uds-core-policies";

/**
 *
 * @param policy
 * @returns Function that takes PeprMutateRequest and evaluates if request isExempt()
 */
export function markExemption<T extends KubernetesObject>(policy: Policy) {
  return (request: PeprMutateRequest<T>) => {
    if (isExempt(request, policy)) {
      request.SetAnnotation(`${exemptionAnnotationPrefix}.${policy}`, "exempted");
      return;
    }
  };
}
