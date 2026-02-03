/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { IstioGateway, IstioServer, IstioTLSMode, RemoteProtocol } from "../../crd";
import { sanitizeResourceName } from "../utils";
import { getSharedAnnotationKey, log } from "./istio-resources";
import { sidecarEgressNamespace as namespace, sharedEgressPkgId } from "./shared/constants";
import { EgressResource } from "./types";

/**
 * Create the egress gateway resource
 *
 * @param host
 * @param resource
 * @param generation
 */
export function generateEgressGateway(host: string, resource: EgressResource, generation: number) {
  const name = generateGatewayName(host);

  // Add annotations from resource
  const annotations: Record<string, string> = {};
  for (const pkgId of resource.packages) {
    annotations[`${getSharedAnnotationKey(pkgId)}`] = "user";
  }

  // Add the gateway servers
  const servers: IstioServer[] = [];
  for (const portProtocol of resource.portProtocols) {
    const port = portProtocol.port;
    const protocol = portProtocol.protocol;
    const server = generateGatewayServer(host, protocol, port);
    servers.push(server);
  }

  // Define the gateway
  const gateway: IstioGateway = {
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
      selector: {
        app: "egressgateway",
      },
      servers,
    },
  };

  return gateway;
}

// Generate the gateway server portion of the spec
function generateGatewayServer(host: string, protocol: RemoteProtocol, port: number) {
  return {
    hosts: [host],
    port: {
      name: `${protocol.toLowerCase()}-${port.toString()}`,
      number: port,
      protocol: protocol,
    },
    tls: {
      mode: IstioTLSMode.Passthrough,
    },
  };
}

// Check for other gateways that might conflict - gateways that are not added by the operator
// Note: Users adding their own Istio resources will need to understand the possible conflicts with the spec. This is not an operation
// blocked by K8s, but will be identified as invalid by Istio. The UDS operator will only manage/deconflict resources it creates or those
// that follow the deterministic naming convention.
export async function warnMatchingExistingGateways(host: string) {
  const gateways = await K8s(IstioGateway).Get();
  const name = generateGatewayName(host);

  // Match any gateways with matching hosts
  for (const gw of gateways.items) {
    if (gw.metadata?.name === name && gw.metadata?.namespace === namespace) {
      // Don't warn if the gateway is the one we created
      continue;
    }
    if (gw.spec && gw.spec.servers) {
      for (const srv of gw.spec.servers) {
        for (const srvHost of srv.hosts) {
          if (srvHost === host) {
            const errText = `Found existing Gateway ${gw.metadata?.name}/${gw.metadata?.namespace} with matching host. Istio will not behave properly with multiple Gateways using the same hosts.`;
            log.error(errText);
            throw new Error(errText);
          }
        }
      }
    }
  }
}

// Deterministically generate the gateway name
export function generateGatewayName(host: string) {
  return sanitizeResourceName(`gateway-${host}`);
}
