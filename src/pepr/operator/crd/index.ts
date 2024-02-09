import { V1OwnerReference } from "@kubernetes/client-node";
// import { GenericKind } from "kubernetes-fluent-client";

import { Package as UDSPackage } from "./generated/package-v1alpha1";
import { Exemption as UDSExemption } from "./generated/exemption-v1alpha1";

// export interface UDSCR extends GenericKind {};

export type UDSCR = UDSPackage | UDSExemption;

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
  Policy,
  Status as ExmptStatus,
  Phase as ExmptPhase,
  Exemption as UDSExemption,
} from "./generated/exemption-v1alpha1";

export * as Istio from "./generated/istio/virtualservice-v1beta1";

export function getOwnerRef(cr: UDSCR): V1OwnerReference[] {
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
