import { KubernetesObject } from "kubernetes-fluent-client";
import { Log, PeprMutateRequest, PeprValidateRequest } from "pepr";
import { ExemptionStore } from "../../operator/controllers/exemptions/exemption-store";
import { Policy } from "../../operator/crd";

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

  if (exemptList.length != 0) {
    // Debug log to provide current exemptions for policy
    Log.debug(
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
      Log.info(`${resourceName} is exempt from ${policy}`);
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
