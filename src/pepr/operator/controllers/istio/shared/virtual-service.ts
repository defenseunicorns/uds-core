/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";

import {
  Expose,
  Gateway,
  IstioHTTP,
  IstioHTTPRoute,
  IstioTLS,
  IstioVirtualService,
} from "../../../crd";
import { UDSConfig } from "../../config/config";
import { sanitizeResourceName } from "../../utils";
import { EgressResource } from "./types";

function generateGatewayName(host: string) {
  return `egress-gw-${host}`;
}

/**
 * Creates a VirtualService for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export function generateIngressVirtualService(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { gateway = Gateway.Tenant, host, port, service, advancedHTTP = {} } = expose;

  const name = generateVSName(pkgName, expose);

  // Get the correct domain based on gateway or custom domain
  let domain = UDSConfig.domain;
  if (expose.domain) {
    domain = expose.domain;
  } else if (gateway === Gateway.Admin || gateway.includes("admin")) {
    domain = UDSConfig.adminDomain;
  }

  // Add the host to the domain, unless this is the reserved root domain host (`.`)
  let fqdn = "";
  if (host === ".") {
    fqdn = domain;
  } else {
    fqdn = `${host}.${domain}`;
  }

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

  // If the gateway is the passthrough gateway or includes passthrough in the name, apply the TLS match
  if (gateway === Gateway.Passthrough || gateway.includes("passthrough")) {
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
  const sanitizedHost = host === "." ? "root-domain" : host;
  const nameSuffix = description || `${sanitizedHost}-${port}-${service}-${matchHash}`;
  const name = sanitizeResourceName(`${pkgName}-${gateway}-${nameSuffix}`);

  return name;
}

/**
 * Create the egress Virtual Service resource
 *
 * @param host
 * @param resource
 * @param generation
 */
export function generateEgressVirtualService(
  host: string,
  resource: EgressResource,
  generation: number,
) {
  const name = generateEgressVSName(host);

  // Add annotations from resource
  const annotations: Record<string, string> = {};
  for (const pkgId of resource.packages) {
    annotations[`uds.dev/user-${pkgId}`] = "user";
  }

  // Add the gateway servers
  const httpRoutes: IstioHTTP[] = [];
  const tlsRoutes: IstioTLS[] = [];
  for (const portProtocol of resource.portProtocols) {
    const port = portProtocol.port;
    const protocol = portProtocol.protocol;
    const route = generateVirtualServiceRoutes(host, port, protocol);
    if (protocol == "TLS") {
      tlsRoutes.push(...(route as IstioTLS[]));
    } else if (protocol == "HTTP") {
      httpRoutes.push(...(route as IstioHTTP[]));
    }
  }

  // Define the gateway
  const vs: IstioVirtualService = {
    metadata: {
      name,
      namespace: "istio-egress-gateway",
      annotations,
      labels: {
        "uds/generation": generation.toString(),
        "uds/package": "shared-egress-resource",
      },
    },
    spec: {
      hosts: [host],
      gateways: ["mesh", `${generateGatewayName(host)}`],
      ...(tlsRoutes.length > 0 && { tls: tlsRoutes }),
      ...(httpRoutes.length > 0 && { http: httpRoutes }),
    },
  };

  return vs;
}

// Generates the HTTP/TLS routes for the virtual service
function generateVirtualServiceRoutes(host: string, port: number, protocol: string) {
  const meshMatch = {
    gateways: ["mesh"],
    port,
    ...(protocol == "TLS" && { sniHosts: [host] }),
  };

  const gatewayMatch = {
    gateways: [`egress-gw-${host}`],
    port,
    ...(protocol == "TLS" && { sniHosts: [host] }),
  };

  return [
    {
      match: [meshMatch],
      route: [
        {
          destination: {
            host: `egressgateway.istio-egress-gateway.svc.cluster.local`,
            port: { number: port },
          },
        },
      ],
    },
    {
      match: [gatewayMatch],
      route: [
        {
          destination: {
            host,
            port: { number: port },
          },
        },
      ],
    },
  ];
}

export function generateEgressVSName(host: string) {
  return sanitizeResourceName(`egress-vs-${host}`);
}
