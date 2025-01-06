/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { UDSConfig } from "../../../config";
import {
  Expose,
  Gateway,
  IstioEndpoint,
  IstioLocation,
  IstioPort,
  IstioResolution,
  IstioServiceEntry,
} from "../../crd";
import { sanitizeResourceName } from "../utils";

/**
 * Creates a ServiceEntry for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export function generateServiceEntry(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { gateway = Gateway.Tenant, host } = expose;

  const name = generateSEName(pkgName, expose);

  // Get the correct domain based on gateway
  const domain = gateway === Gateway.Admin ? UDSConfig.adminDomain : UDSConfig.domain;

  // Append the domain to the host
  const fqdn = `${host}.${domain}`;

  const serviceEntryPort: IstioPort = {
    name: "https",
    number: 443,
    protocol: "HTTPS",
  };

  const serviceEntryEndpoint: IstioEndpoint = {
    // Map the gateway (admin, passthrough or tenant) to the ServiceEntry
    address: `${gateway}-ingressgateway.istio-${gateway}-gateway.svc.cluster.local`,
  };

  const payload: IstioServiceEntry = {
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      // Use the CR as the owner ref for each ServiceEntry
      ownerReferences: ownerRefs,
    },
    spec: {
      // Append the UDS Domain to the host
      hosts: [fqdn],
      location: IstioLocation.MeshInternal,
      resolution: IstioResolution.DNS,
      ports: [serviceEntryPort],
      endpoints: [serviceEntryEndpoint],
    },
  };

  return payload;
}

export function generateSEName(pkgName: string, expose: Expose) {
  const { gateway = Gateway.Tenant, host } = expose;

  // Ensure the resource name is valid
  const name = sanitizeResourceName(`${pkgName}-${gateway}-${host}`);

  return name;
}
