import { KubernetesObject } from "kubernetes-fluent-client";
import { Log, PeprMutateRequest, PeprValidateRequest } from "pepr";
import { Policy } from "../../operator/crd";
import { policyExemptionMap } from "../common";

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
  const exemptList = policyExemptionMap.get(policy) || [];
  const resourceName = request.Raw.metadata?.name || request.Raw.metadata?.generateName;
  const resourceNamespace = request.Raw.metadata?.namespace;

  Log.debug(
    `Checking for ${resourceName} in ${policy} exemption list: ${JSON.stringify(exemptList)}`,
  );

  // Loop through the exempt list
  for (const exempt of exemptList) {
    // If the exempt namespace is specified, check it
    if (exempt.namespace && exempt.namespace !== resourceNamespace) {
      continue;
    }

    // If the exempt name is specified, check it
    if (exempt.name && !resourceName?.match(exempt.name)) {
      continue;
    }

    // If we get here, the request is exempt
    Log.info("request is exempt", { exempt });
    return true;
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
