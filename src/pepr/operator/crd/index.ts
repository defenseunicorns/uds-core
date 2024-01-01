import { V1OwnerReference } from "@kubernetes/client-node";

import { Package as UDSPackage } from "./generated/package-v1alpha1";

export {
  Allow,
  DisableDefault,
  Gateway,
  Direction,
  Package as UDSPackage,
} from "./generated/package-v1alpha1";

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
