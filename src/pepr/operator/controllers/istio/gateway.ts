import { K8s } from "pepr";
import { IstioGateway, IstioTLSMode } from "../../crd";
import {
  istioEgressGatewayNamespace,
  log,
  sharedResourcesAnnotationPrefix,
} from "./istio-resources";

/**
 * Find existing gateway, creating if needed, and patches if fields missing
 *
 * @param sharedResourceId
 * @param pkgId
 * @param host
 * @param protocol
 * @param port
 * @param attempt
 */
export async function createOrPatchEgressGateway(
  sharedResourceId: string,
  pkgId: string,
  host: string,
  protocol: string,
  port: number,
  attempt: number = 0, // Add attempt counter
) {
  const maxAttempts = 3; // Maximum number of attempts to reconcile

  // Retrieve the existing Gateway matching the sharedResourceId
  await K8s(IstioGateway)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(sharedResourceId)
    .then(async (gw) => {
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
          `Found existing gateway ${sharedResourceId} with different port/protocol. Patching ${protocol}:${port}.`,
        );
        await patchGatewayServer(gw, sharedResourceId, host, protocol, port);
      }

      // Add the package annotation if not found
      const annotations = gw.metadata?.annotations || {};
      if (
        !Object.keys(annotations).find(
          key => key == `${sharedResourcesAnnotationPrefix}-${pkgId}`,
        )
      ) {
        await patchGatewayAnnotations(gw, sharedResourceId, pkgId);
      }
    }, async () => {
      const newGateway = await generateEgressGateway(
        sharedResourceId,
        pkgId,
        host,
        protocol,
        port,
      );
      log.debug(`Creating gateway ${sharedResourceId} with ${protocol}:${port}.`);

      await K8s(IstioGateway)
        .Create(newGateway)
        .catch(async () => {
          log.error(
            `Failed to create gateway ${sharedResourceId}. Attempt ${attempt + 1} of ${maxAttempts}.`,
          );
          if (attempt + 1 >= maxAttempts) {
            throw new Error(
              `Failed to create gateway ${sharedResourceId} after ${maxAttempts} attempts.`,
            );
          }
          return await createOrPatchEgressGateway(
            sharedResourceId,
            pkgId,
            host,
            protocol,
            port,
            attempt + 1,
          );
        });
      }        
    );
}

// Recursive function to patch the gateway annotation with the package ID
export async function patchGatewayAnnotations(
  gw: IstioGateway,
  sharedResourceId: string,
  pkgId: string,
  // annotations: Record<string, string>,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  try {
    await K8s(IstioGateway, { name: sharedResourceId, namespace: gw.metadata?.namespace }).Patch([
      {
        op: "replace",
        path: `/metadata/annotations/uds.dev~1user-${pkgId}`,
        value: "user",
      },
    ]);
  } catch (error) {
    log.error(
      `Failed to patch gateway annotations for ${sharedResourceId}: ${Object.keys(error)}. Attempt ${attempt + 1} of ${maxAttempts}.`,
    );
    if (attempt + 1 >= maxAttempts) {
      throw new Error(
        `Failed to patch gateway annotations for ${sharedResourceId} after ${maxAttempts} attempts.`,
      );
    }
    return await patchGatewayAnnotations(gw, sharedResourceId, pkgId, attempt + 1, maxAttempts);
  }
}

// Recursive function to patch the gateway server with the host, protocol, and port
async function patchGatewayServer(
  gw: IstioGateway,
  sharedResourceId: string,
  host: string,
  protocol: string,
  port: number,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  try {
    await K8s(IstioGateway, { name: sharedResourceId, namespace: gw.metadata?.namespace }).Patch([
      {
        op: "add",
        path: "/spec/servers/-",
        value: {
          hosts: [host],
          port: {
            name: `${protocol.toLowerCase()}-${port.toString()}`,
            number: port,
            protocol: protocol,
          },
          tls: {
            mode: IstioTLSMode.Passthrough,
          },
        },
      },
    ]);
  } catch (error) {
    log.error(
      `Failed to patch gateway server for ${sharedResourceId}: ${JSON.stringify(error)}. Attempt ${attempt + 1} of ${maxAttempts}.`,
    );
    if (attempt + 1 >= maxAttempts) {
      throw new Error(
        `Failed to patch gateway server for ${sharedResourceId} after ${maxAttempts} attempts.`,
      );
    }
    return patchGatewayServer(gw, sharedResourceId, host, protocol, port, attempt + 1, maxAttempts);
  }
}

// Generate the egress gateway resource
// TODO: To enhance cleanup capabilities it might be beneficial to add array of port/protocol in annotation
async function generateEgressGateway(
  gatewayName: string,
  pkgId: string,
  host: string,
  protocol: string,
  port: number,
) {
  // Warn if there are existing gateways with the same host
  await warnMatchingExistingGateways(host);

  const gateway: IstioGateway = {
    metadata: {
      name: gatewayName,
      namespace: istioEgressGatewayNamespace,
      annotations: {
        [`${sharedResourcesAnnotationPrefix}-${pkgId}`]: "user",
      },
    },
    spec: {
      selector: {
        app: "egressgateway",
      },
      servers: [
        {
          hosts: [host],
          port: {
            name: `${protocol.toLowerCase()}-${port.toString()}`,
            number: port,
            protocol: protocol,
          },
          tls: {
            mode: IstioTLSMode.Passthrough,
          },
        },
      ],
    },
  };

  return gateway;
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
              `Found existing gateway ${gw.metadata?.name}/${gw.metadata?.namespace} with matching host. Istio will not behave properly with multiple gateways using the same hosts.`,
            );
            break;
          }
        }
      }
    }
  }
}

//
