/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";

import { K8s } from "pepr";
import {
  Expose,
  Gateway,
  IstioHTTP,
  IstioHTTPRoute,
  IstioTLS,
  IstioVirtualService,
} from "../../crd";
import { getFqdn } from "../domain-utils";
import { sanitizeResourceName } from "../utils";
import { sidecarEgressNamespace as namespace, sharedEgressPkgId } from "./egress-sidecar";
import { generateGatewayName } from "./gateway";
import { getSharedAnnotationKey, log } from "./istio-resources";
import { EgressResource } from "./types";

// @lulaStart 8bdce490-04f6-45db-9353-d429ba24e1ff
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
  const { gateway = Gateway.Tenant, port, service, advancedHTTP = {} } = expose;

  const name = generateVSName(pkgName, expose);
  const fqdn = getFqdn(expose);

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
// @lulaEnd 8bdce490-04f6-45db-9353-d429ba24e1ff

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
    annotations[`${getSharedAnnotationKey(pkgId)}`] = "user";
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
      namespace,
      annotations,
      labels: {
        "uds/generation": generation.toString(),
        "uds/package": sharedEgressPkgId,
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
    gateways: [`${generateGatewayName(host)}`],
    port,
    ...(protocol == "TLS" && { sniHosts: [host] }),
  };

  return [
    {
      match: [meshMatch],
      route: [
        {
          destination: {
            host: `egressgateway.${namespace}.svc.cluster.local`,
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

// Check for other virtual services that might conflict - virtual services that are not added by the operator
// Note: Users adding their own Istio resources will need to understand the possible conflicts with the spec. This is not an operation
// blocked by K8s, but will be identified as invalid by Istio. The UDS operator will only manage/deconflict resources it creates or those
// that follow the naming convention.
export async function warnMatchingExistingVirtualServices(host: string) {
  const virtualServices = await K8s(IstioVirtualService).Get();
  const name = generateEgressVSName(host);

  // Match any virtual services with matching hosts
  for (const vs of virtualServices.items) {
    if (vs.metadata?.name === name && vs.metadata?.namespace === namespace) {
      // Don't warn if the virtual service is the one we created
      continue;
    }
    if (vs.spec && vs.spec.hosts) {
      for (const vsHost of vs.spec.hosts) {
        if (vsHost === host) {
          const errText = `Found existing Virtual Service ${vs.metadata?.name}/${vs.metadata?.namespace} with matching host. Istio will not behave properly with multiple Virtual Services using the same hosts.`;
          log.error(errText);
          throw new Error(errText);
        }
      }
    }
  }
}

export function generateEgressVSName(host: string) {
  return sanitizeResourceName(`egress-vs-${host}`);
}
