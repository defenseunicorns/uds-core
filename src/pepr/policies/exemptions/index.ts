import { KubernetesObject } from "kubernetes-fluent-client";
import { Log, PeprMutateRequest, PeprValidateRequest } from "pepr";
import { Policy } from "../../operator/crd";
import { Store } from "../common";

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
  const exemptList = JSON.parse(Store.getItem(policy) || "[]");

  // Loop through the exempt list
  for (const exempt of exemptList) {
    // If the exempt namespace is specified, check it
    if (exempt.namespace && exempt.namespace !== request.Raw.metadata?.namespace) {
      continue;
    }

    // If the exempt name is specified, check it
    const name = request.Raw.metadata?.name || request.Raw.metadata?.generateName;
    if (exempt.name && !name?.match(exempt.name)) {
      continue;
    }

    // If we get here, the request is exempt
    Log.info("request is exempt", { exempt });
    return true;
  }

  // No exemptions matched
  return false;
}

/**
 *
 * @param policy
 * @returns Function that takes PeprMutateRequest and evaluates if request isExempt()
 */
export function markExemption<T extends KubernetesObject>(policy: Policy) {
  return (request: PeprMutateRequest<T>) => {
    if (isExempt(request, policy)) {
      request.SetAnnotation(`uds-core.pepr.dev/uds-core-policies.${policy}`, "exempted");
      return;
    }
  };
}
