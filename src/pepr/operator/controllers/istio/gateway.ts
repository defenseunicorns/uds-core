/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { IstioGateway, IstioTLSMode } from "../../crd";
import {
  getSharedAnnotationKey,
  istioEgressGatewayNamespace,
  log,
  sharedResourcesAnnotationPrefix,
} from "./istio-resources";
import { sanitizeResourceName } from "../utils";

/**
 * Find existing gateway, generating if needed or patches if fields missing
 *
 * @param pkgId
 * @param host
 * @param protocol
 * @param port
 * @param attempt
 * @param maxAttempts
 */
export async function generateOrPatchEgressGateway(
  pkgId: string,
  host: string,
  protocol: string,
  port: number,
  attempt: number = 0, // Add attempt counter
  maxAttempts: number = 3, // Maximum number of attempts to reconcile
) {
  const gwName = generateGatewayName(host);

  // Retrieve the existing Gateway matching the host
  await K8s(IstioGateway)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(gwName)
    .then(async gw => {
      // Update the port/protocol spec if different
      let foundMatchingPortProtocol: boolean = false;
      if (gw.spec && gw.spec.servers) {
        for (const server of gw.spec.servers) {
          if (server.port.number === port && server.port.protocol === protocol) {
            foundMatchingPortProtocol = true;
            break;
          }
        }
      }

      // Patch the port/protocol if not found
      if (!foundMatchingPortProtocol) {
        log.debug(
          `Found existing Gateway ${gwName} with different port/protocol. Patching ${protocol}:${port}.`,
        );
        await patchGatewayServer(gw, host, protocol, port);
      }

      // Add the package annotation if not found
      const annotations = gw.metadata?.annotations || {};
      const pkgKey = getSharedAnnotationKey(pkgId);
      if (!Object.keys(annotations).find(key => key == pkgKey)) {
        // TODO: Add something more descriptive than "user" to the annotation value, e.g., [{ "host": "x", "protocol": "y", "port": "z" }]
        // Scenario where a package allow is modified... the old data will still be persisted in the server
        annotations[`${pkgKey}`] = "user";
        await patchGatewayAnnotations(gw, annotations);
      }
    })
    .catch(async err => {
      if (err.status == 404) {
        const newGateway = await generateEgressGateway(gwName, pkgId, host, protocol, port);
        log.debug(`Creating new Gateway ${gwName} with ${protocol}:${port}.`);

        await K8s(IstioGateway)
          .Create(newGateway)
          .catch(async () => {
            // Re-run function if this errors, indicating a parallel process may have created the resource
            if (attempt < maxAttempts) {
              log.warn(
                `Failed to create Gateway ${gwName}. Attempt ${attempt + 1} of ${maxAttempts}.`,
              );
              await generateOrPatchEgressGateway(
                pkgId,
                host,
                protocol,
                port,
                attempt + 1,
                maxAttempts,
              );
            } else {
              throw new Error(`Failed to create Gateway ${gwName}.`);
            }
          });
      } else {
        // Throw error
        throw new Error(`Failed to find Gateway ${gwName} with error code ${err.status}.`);
      }
    });
}

// TODO: cleanup unused servers from gw.spec.servers
export async function cleanupEgressGateway(
  host: string,
  pkgId: string,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  const gwName = generateGatewayName(host);

  await K8s(IstioGateway)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(gwName)
    .then(async gw => {
      // Get the sharedResourcesAnnotation annotation
      const annotations = gw.metadata?.annotations || {};

      // Remove the package annotation
      delete annotations[`${getSharedAnnotationKey(pkgId)}`];

      // If there are no more UDS Package annotations, remove the resource
      if (!Object.keys(annotations).find(key => key.startsWith(sharedResourcesAnnotationPrefix))) {
        await K8s(IstioGateway).InNamespace(istioEgressGatewayNamespace).Delete(gwName);
      } else {
        // Patch the gateway annotations
        await patchGatewayAnnotations(gw, annotations);
      }
    })
    .catch(async err => {
      if (err.status === 404) {
        log.debug(`Gateway ${gwName} not found.`);
        return;
      } else {
        log.error(`Failed to cleanup Gateway ${gwName}. Attempt ${attempt + 1} of ${maxAttempts}.`);
        if (attempt + 1 >= maxAttempts) {
          throw new Error(`Failed to cleanup Gateway ${gwName} after ${maxAttempts} attempts.`);
        }
        return await cleanupEgressGateway(host, pkgId, attempt + 1, maxAttempts);
      }
    });
}

// Recursive function to patch the gateway annotation with the package ID
async function patchGatewayAnnotations(
  gw: IstioGateway,
  annotations: Record<string, string>,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  await K8s(IstioGateway, { name: gw.metadata?.name, namespace: gw.metadata?.namespace })
    .Patch([
      {
        op: "replace",
        path: "/metadata/annotations",
        value: annotations,
      },
    ])
    .catch(async () => {
      log.error(
        `Failed to patch Gateway annotations for ${gw.metadata?.name}. Attempt ${attempt + 1} of ${maxAttempts}.`,
      );
      if (attempt + 1 >= maxAttempts) {
        throw new Error(
          `Failed to patch Gateway annotations for ${gw.metadata?.name} after ${maxAttempts} attempts.`,
        );
      }
      return await patchGatewayAnnotations(gw, annotations, attempt + 1, maxAttempts);
    });
}

// Recursive function to patch the gateway server with the host, protocol, and port
async function patchGatewayServer(
  gw: IstioGateway,
  host: string,
  protocol: string,
  port: number,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  await K8s(IstioGateway, { name: gw.metadata?.name, namespace: gw.metadata?.namespace })
    .Patch([
      {
        op: "add",
        path: "/spec/servers/-",
        value: generateGatewayServer(host, protocol, port),
      },
    ])
    .catch(async () => {
      log.error(
        `Failed to patch Gateway server for ${gw.metadata?.name}. Attempt ${attempt + 1} of ${maxAttempts}.`,
      );
      if (attempt + 1 >= maxAttempts) {
        throw new Error(
          `Failed to patch Gateway server for ${gw.metadata?.name} after ${maxAttempts} attempts.`,
        );
      }
      return await patchGatewayServer(gw, host, protocol, port, attempt + 1, maxAttempts);
    });
}

// Generate the egress gateway resource
// TODO: To enhance cleanup capabilities it might be beneficial to add array of port/protocol in annotation
async function generateEgressGateway(
  gwName: string,
  pkgId: string,
  host: string,
  protocol: string,
  port: number,
) {
  // Warn if there are existing gateways with the same host
  await warnMatchingExistingGateways(host);

  const gateway: IstioGateway = {
    metadata: {
      name: gwName,
      namespace: istioEgressGatewayNamespace,
      annotations: {
        [`${getSharedAnnotationKey(pkgId)}`]: "user",
      },
    },
    spec: {
      selector: {
        app: "egressgateway",
      },
      servers: [generateGatewayServer(host, protocol, port)],
    },
  };

  return gateway;
}

function generateGatewayServer(host: string, protocol: string, port: number) {
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

// *** What about gateways that are not added by the operator? ***
// Assumption: Users adding their own Istio resources will need to understand the possible conflicts with the spec. This is not an operation
// blocked by K8s, but will be identified as invalid by Istio. The UDS operator will only manage/deconflict resources it creates or those
// that follow the naming convention.
async function warnMatchingExistingGateways(host: string) {
  const gateways = await K8s(IstioGateway).Get();

  // Match any gateways with matching host, port, and protocol
  for (const gw of gateways.items) {
    if (gw.spec && gw.spec.servers) {
      for (const srv of gw.spec.servers) {
        for (const srvHost of srv.hosts) {
          if (srvHost === host) {
            log.debug(
              `Found existing Gateway ${gw.metadata?.name}/${gw.metadata?.namespace} with matching host. Istio will not behave properly with multiple Gateways using the same hosts.`,
            );
            break;
          }
        }
      }
    }
  }
}

// Re-usable function to get gateway name
export function generateGatewayName(host: string) {
  return sanitizeResourceName(`gateway-${host}`);
}
