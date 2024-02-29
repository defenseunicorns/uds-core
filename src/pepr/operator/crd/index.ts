import { V1OwnerReference } from "@kubernetes/client-node";
import { GenericKind } from "kubernetes-fluent-client";

export {
  Allow,
  Direction,
  Expose,
  Gateway,
  Phase,
  RemoteGenerated,
  Status as PkgStatus,
  Package as UDSPackage,
} from "./generated/package-v1alpha1";

export {
  ExemptionElement,
  Matcher,
  Policy,
  Kind as MatcherKind,
  Status as ExemptStatus,
  Phase as ExemptPhase,
  Exemption as UDSExemption,
} from "./generated/exemption-v1alpha1";

export * as Istio from "./generated/istio/virtualservice-v1beta1";

export function getOwnerRef(cr: GenericKind): V1OwnerReference[] {
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
