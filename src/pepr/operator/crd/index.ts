import { V1OwnerReference } from "@kubernetes/client-node";

import { Package as UDSPackage } from "./generated/package-v1alpha1";
import { Exemption as UDSExemption } from "./generated/exemption-v1alpha1";

export {
  Allow,
  Direction,
  Expose,
  Gateway,
  Phase,
  RemoteGenerated,
  Status,
  Package as UDSPackage,
} from "./generated/package-v1alpha1";

export {
  ExemptionElement,
  Matcher,
  PolicyName,
  Status as ExmptStatus,
  Phase as ExmptPhase,
  Exemption as UDSExemption,
} from "./generated/exemption-v1alpha1";

export * as Istio from "./generated/istio/virtualservice-v1beta1";

export function getOwnerRef(cr: UDSPackage | UDSExemption): V1OwnerReference[] {
  const { name, uid } = cr.metadata!;

  return [
    {
      apiVersion: cr.apiVersion!,
      kind: cr.kind!,
      uid: uid!,
      name: name!,
    },
  ];
}
