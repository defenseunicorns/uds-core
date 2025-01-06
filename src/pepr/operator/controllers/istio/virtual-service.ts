/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { UDSConfig } from "../../../config";
import { Expose, Gateway, IstioHTTP, IstioHTTPRoute, IstioVirtualService } from "../../crd";
import { sanitizeResourceName } from "../utils";

/**
 * Creates a VirtualService for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export function generateVirtualService(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { gateway = Gateway.Tenant, host, port, service, advancedHTTP = {} } = expose;

  const name = generateVSName(pkgName, expose);

  // Get the correct domain based on gateway
  const domain = gateway === Gateway.Admin ? UDSConfig.adminDomain : UDSConfig.domain;

  // Append the domain to the host
  const fqdn = `${host}.${domain}`;

  const http: IstioHTTP = { ...advancedHTTP };

  // Create the route to the service
  const route: IstioHTTPRoute[] = [
    {
      destination: {
        // Use the service name as the host
        host: `${service}.${namespace}.svc.cluster.local`,
        // The CRD only uses numeric ports
        port: { number: port },
      },
    },
  ];

  if (!advancedHTTP.directResponse && !advancedHTTP.redirect) {
    // Create the route to the service if not using advancedHTTP.directResponse
    http.route = route;
  }

  const payload: IstioVirtualService = {
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      // Use the CR as the owner ref for each VirtualService
      ownerReferences: ownerRefs,
    },
    spec: {
      // Append the UDS Domain to the host
      hosts: [fqdn],
      // Map the gateway (admin, passthrough or tenant) to the VirtualService
      gateways: [`istio-${gateway}-gateway/${gateway}-gateway`],
      // Apply the route to the VirtualService
      http: [http],
    },
  };

  // If the gateway is the passthrough gateway, apply the TLS match
  if (gateway === Gateway.Passthrough) {
    payload.spec!.tls = [
      {
        match: [{ port: 443, sniHosts: [fqdn] }],
        route,
      },
    ];
  }
  return payload;
}

export function generateVSName(pkgName: string, expose: Expose) {
  const { gateway = Gateway.Tenant, host, port, service, description, advancedHTTP } = expose;

  // Ensure the resource name is valid
  const matchHash = advancedHTTP?.match?.flatMap(m => m.name).join("-") || "";
  const nameSuffix = description || `${host}-${port}-${service}-${matchHash}`;
  const name = sanitizeResourceName(`${pkgName}-${gateway}-${nameSuffix}`);

  return name;
}
