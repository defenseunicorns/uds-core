import { KubernetesObject } from "kubernetes-fluent-client";
import { Log, PeprMutateRequest, PeprValidateRequest } from "pepr";

export type Exempt = {
  /**
   * Namespace of the resource to exempt.
   */
  namespace?: string;
  /**
   * Name of the resource to exempt. Can be a regular expression.
   */
  name?: string | RegExp;
};

export type ExemptList = Array<Exempt>;

/**
 * Register a list of exemptions to be used by the validation action.
 *
 * @param exemptList
 * @returns A function that can be used to check if a request is exempt.
 */
export function registerExemptions(exemptList: ExemptList) {
  /**
   * Check if the request is exempt from validation.
   *
   * @param request The request to check.
   * @returns True if the request is exempt, false otherwise.
   */
  return <T extends KubernetesObject>(request: PeprValidateRequest<T> | PeprMutateRequest<T>) => {
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
  };
}
