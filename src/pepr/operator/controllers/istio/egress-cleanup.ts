/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { UDSPackage } from "../../crd";
import { cleanupEgressDestinationRule } from "./destination-rule";
import { cleanupEgressGateway } from "./gateway";
import { cleanupEgressVirtualService } from "./virtual-service";
import { getPackageId } from "./istio-resources";

export async function egressCleanup(pkg: UDSPackage) {
  const pkgId = getPackageId(pkg);

  // Get the list of allowed services
  const allowList = pkg.spec?.network?.allow ?? [];

  for (const allow of allowList) {
    const remoteHost = allow.remoteHost;

    if (remoteHost) {
      // Clean up the virtual service
      await cleanupEgressVirtualService(remoteHost, pkgId);

      // Clean up the destination rule
      await cleanupEgressDestinationRule(pkgId);

      // Clean up the egress gateway
      await cleanupEgressGateway(remoteHost, pkgId);

      // Clean up the Sidecar

      // Clean up the ServiceEntry
    }
  }
}
