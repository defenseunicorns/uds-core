import { KubernetesObject } from "kubernetes-fluent-client";
import { Log, PeprMutateRequest, PeprValidateRequest } from "pepr";
import { Policy } from "../../operator/crd";
import { Store } from "../common";

/**
 * Register a list of exemptions to be used by the validation action.
 *
 * @param policy Policy to get exemptions for
 * @param request The request to check.
 * @returns True if exempt and false otherwise
 */
export function isExempt<T extends KubernetesObject>(
  policy: Policy,
  request: PeprValidateRequest<T> | PeprMutateRequest<T>,
) {
  const exemptList = JSON.parse(Store.getItem(policy) || "[]");

  // Loop through the exempt list
  for (const exempt of exemptList) {
    // If the exempt name is specified, check it
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
