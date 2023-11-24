import { KubernetesObject } from "kubernetes-fluent-client";
import { Log, PeprValidateRequest } from "pepr";

export type Exempt = {
  namespace?: string;
  name?: string | RegExp;
  // /**
  //  * List of labels to match on the resource. All labels must match.
  //  */
  // allLabels?: Array<[string, string]>;
  // /**
  //  * List of labels to match on the resource. At least one label must match.
  //  */
  // someLabels?: Array<[string, string]>;
};

export type ExemptList = Array<Exempt>;

export function isExempt<T extends KubernetesObject>(
  request: PeprValidateRequest<T>,
  exemptList: ExemptList,
) {
  for (const exempt of exemptList) {
    // If the exempt name is specified, check it
    if (exempt.namespace && exempt.namespace !== request.Raw.metadata?.namespace) {
      continue;
    }

    // If the exempt name is specified, check it
    if (exempt.name && !request.Raw.metadata?.name?.match(exempt.name)) {
      continue;
    }

    // If we get here, the request is exempt
    Log.info("request is exempt", { exempt });
    return true;
  }

  // No exemptions matched
  return false;
}
