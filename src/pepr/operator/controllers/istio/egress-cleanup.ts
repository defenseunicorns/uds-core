/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s } from "pepr";
import { IstioGateway, UDSPackage } from "../../crd";
// import { patchGatewayAnnotations } from "./gateway";
import {
  getPackageId,
  getSharedResourceId,
  istioEgressGatewayNamespace,
  sharedResourcesAnnotationPrefix,
} from "./istio-resources";

export async function egressCleanup(pkg: UDSPackage) {
  const pkgId = getPackageId(pkg);

  // Get the list of allowed services
  const allowList = pkg.spec?.network?.allow ?? [];

  for (const allow of allowList) {
    const remoteHost = allow.remoteHost;

    if (remoteHost) {
      const sharedResourceId = getSharedResourceId(remoteHost);

      const gateway = await K8s(IstioGateway)
        .InNamespace(istioEgressGatewayNamespace)
        .Get(sharedResourceId);

      // Get the sharedResourcesAnnotation annotation
      const annotations = gateway.metadata?.annotations || {};

      // Remove the package annotation
      delete annotations[`${sharedResourcesAnnotationPrefix}-${pkgId}`];

      // If there are no more UDS Package annotations, remove the resource
      if (!Object.keys(annotations).find(key => key.startsWith(sharedResourcesAnnotationPrefix))) {
        await K8s(IstioGateway).InNamespace(istioEgressGatewayNamespace).Delete(sharedResourceId);
      }

      // if (annotations && annotations[sharedResourcesAnnotation]) {
      //     const users = JSON.parse(annotations[sharedResourcesAnnotation]);
      //     // delete the pkgId key from users
      //     delete users[pkgId];

      //     // if users is empty, delete the resource
      //     if (Object.keys(users).length === 0) {
      //         await K8s(IstioGateway)
      //             .InNamespace(istioEgressGatewayNamespace)
      //             .Delete(sharedResourceId);
      //     } else {
      //         // Update the annotations using patchGatewayServer
      //         annotations[sharedResourcesAnnotation] = JSON.stringify(users);
      //         await patchGatewayAnnotations(gateway, sharedResourceId, annotations);
      //     }
      // }
    }
  }
}
