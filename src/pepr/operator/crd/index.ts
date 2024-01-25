import { V1OwnerReference } from "@kubernetes/client-node";

import { Package as UDSPackage } from "./generated/package-v1alpha1";

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

export * as Istio from "./generated/istio/virtualservice-v1beta1";

export function getOwnerRef(pkg: UDSPackage): V1OwnerReference[] {
  const { name, uid } = pkg.metadata!;

  return [
    {
      apiVersion: pkg.apiVersion!,
      kind: pkg.kind!,
      uid: uid!,
      name: name!,
    },
  ];
}
