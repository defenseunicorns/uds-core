/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { V1OwnerReference } from "@kubernetes/client-node";
import { UDSConfig } from "../../../config";
import { Expose, Gateway, IstioHTTP, IstioHTTPRoute, IstioVirtualService } from "../../crd";
import { sanitizeResourceName } from "../utils";
import { getSharedAnnotationKey, istioEgressGatewayNamespace, log, sharedResourcesAnnotationPrefix } from "./istio-resources";
import { subsetName } from "./destination-rule";
import { generateGatewayName } from "./gateway";

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

/**
 * Find existing egress virtual service, generating if needed or patches if fields missing
 *
 * @param pkgId
 * @param host
 * @param protocol
 * @param port
 * @param attempt
 * @param maxAttempts
 */
export async function generateOrPatchEgressVirtualService(
  pkgId: string,
  host: string,
  protocol: string,
  port: number,
  attempt: number = 0, // Add attempt counter
  maxAttempts: number = 3, // Maximum number of attempts to reconcile
) {
  const vsName = generateEgressVSName(host);

  // Retrieve the existing Gateway matching the sharedResourceId
  await K8s(IstioVirtualService)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(vsName)
    .then(async vs => {
      // Check port/protocol is defined for the host
      let foundMatchingPortProtocol: boolean = false;
      if (vs.spec && vs.spec.http && protocol == "HTTP") {
        // Check if any http route destinations match the port
        for (const http of vs.spec.http) {
          if (http.route) {
            for (const route of http.route) {
              if (route.destination?.port == port) {
                foundMatchingPortProtocol = true;
                break;
              }
            }
          }
        }
      } else if (vs.spec && vs.spec.tls && protocol == "TLS") {
        // Check if any tls route destinations match the port
        for (const tls of vs.spec.tls) {
          if (tls.route) {
            for (const route of tls.route) {
              if (route.destination?.port === port) {
                foundMatchingPortProtocol = true;
                break;
              }
            }
          }
        }
      }

      // Patch the port/protocol if not found
      if (!foundMatchingPortProtocol) {
        log.debug(
          `Found existing Virtual Service ${vsName} with different port/protocol. Patching ${protocol}:${port}.`,
        );
        await patchVirtualServiceRoute(vs, host, protocol, port);
      }

      // Add the package annotation if not found
      const annotations = vs.metadata?.annotations || {};
      const pkgKey = getSharedAnnotationKey(pkgId);
      if (!Object.keys(annotations).find(key => key == pkgKey)) {
        // TODO: Add something more descriptive than "user" to the annotation value, e.g., [{ "host": "x", "protocol": "y", "port": "z" }]
        // Scenario where a package allow is modified... the old data will still be persisted in the server
        annotations[`${pkgKey}`] = "user";
        await patchVirtualServiceAnnotations(vs, annotations);
      }
    })
    .catch(async err => {
      if (err.status == 404) {
        const newVs = await generateEgressVirtualService(vsName, pkgId, host, protocol, port);
        log.debug(`Creating new Virtual Service ${vsName} with ${protocol}:${port}.`);

        await K8s(IstioVirtualService)
          .Create(newVs)
          .catch(async () => {
            log.error(
              `Failed to create Virtual Service ${vsName}. Attempt ${attempt + 1} of ${maxAttempts}.`,
            );
            if (attempt + 1 >= maxAttempts) {
              throw new Error(
                `Failed to create Virtual Service ${vsName} after ${maxAttempts} attempts.`,
              );
            }
            return await generateOrPatchEgressVirtualService(
              pkgId,
              host,
              protocol,
              port,
              attempt + 1,
            );
          });
      } else {
        // Retry if the error is not a 404
        if (attempt < maxAttempts) {
          log.warn(
            `Failed to get Virtual Service ${vsName}. Attempt ${attempt + 1} of ${maxAttempts}.`,
          );
          await generateOrPatchEgressVirtualService(pkgId, host, protocol, port, attempt + 1);
        } else {
          log.error(`Failed to get Virtual Service ${vsName} after ${maxAttempts} attempts.`);
        }
      }
    });
}

// Clean up the virtual service
export async function cleanupEgressVirtualService(
  host: string,
  pkgId: string,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  const vsName = generateEgressVSName(host);

  await K8s(IstioVirtualService)
    .InNamespace(istioEgressGatewayNamespace)
    .Get(vsName)
    .then(async vs => {
      // Get the sharedResourcesAnnotation annotation
      const annotations = vs.metadata?.annotations || {};

      // Remove the package annotation
      delete annotations[`${getSharedAnnotationKey(pkgId)}`];

      // If there are no more UDS Package annotations, remove the resource
      if (!Object.keys(annotations).find(key => key.startsWith(sharedResourcesAnnotationPrefix))) {
        await K8s(IstioVirtualService).InNamespace(istioEgressGatewayNamespace).Delete(vsName);
      } else {
        // Patch the gateway annotations
        await patchVirtualServiceAnnotations(vs, annotations);
      }
    })
    .catch(async err => {
      if (err.status === 404) {
        log.debug(`Gateway ${vsName} not found.`);
        return;
      } else {
        log.error(`Failed to cleanup Virtual Service ${vsName}. Attempt ${attempt + 1} of ${maxAttempts}.`);
        if (attempt + 1 >= maxAttempts) {
          throw new Error(`Failed to cleanup Virtual Service ${vsName} after ${maxAttempts} attempts.`);
        }
        return await cleanupEgressVirtualService(host, pkgId, attempt + 1, maxAttempts);
      }
    });
}

// Recursive function to patch the virtual service with the host, protocol, and port
async function patchVirtualServiceRoute(
  vs: IstioVirtualService,
  host: string,
  protocol: string,
  port: number,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  // Set default patch path as TLS
  let patchPath = "/spec/tls/-";

  if (protocol == "HTTP") {
    patchPath = "/spec/http/-";
  }

  // Patch the virtual service
  await K8s(IstioVirtualService, { name: vs.metadata?.name, namespace: vs.metadata?.namespace })
    .Patch([
      {
        op: "add",
        path: `${patchPath}`,
        value: generateVirtualServiceRoutes(host, port, protocol),
      },
    ])
    .catch(async () => {
      log.error(
        `Failed to patch gateway server for ${vs.metadata?.name}. Attempt ${attempt + 1} of ${maxAttempts}.`,
      );
      if (attempt + 1 >= maxAttempts) {
        throw new Error(
          `Failed to patch gateway server for ${vs.metadata?.name} after ${maxAttempts} attempts.`,
        );
      }
      return await patchVirtualServiceRoute(vs, host, protocol, port, attempt + 1, maxAttempts);
    });
}

// Recursive function to patch the virtual service annotations with the package ID
async function patchVirtualServiceAnnotations(
  vs: IstioVirtualService,
  annotations: Record<string, string>,
  attempt: number = 0,
  maxAttempts: number = 3,
) {
  await K8s(IstioVirtualService, { name: vs.metadata?.name, namespace: vs.metadata?.namespace })
    .Patch([
      {
        op: "replace",
        path: "/metadata/annotations",
        value: annotations,
      },
    ])
    .catch(async () => {
      log.error(
        `Failed to patch gateway annotations for ${vs.metadata?.name}. Attempt ${attempt + 1} of ${maxAttempts}.`,
      );
      if (attempt + 1 >= maxAttempts) {
        throw new Error(
          `Failed to patch gateway annotations for ${vs.metadata?.name} after ${maxAttempts} attempts.`,
        );
      }
      return await patchVirtualServiceAnnotations(vs, annotations, attempt + 1, maxAttempts);
    });
}

// Generaate the virtual service resource
async function generateEgressVirtualService(
  vsName: string,
  pkgId: string,
  host: string,
  protocol: string,
  port: number,
) {
  // Warn if there are existing gateways with the same host
  await warnMatchingExistingVirtualServices(host);
  const routes = generateVirtualServiceRoutes(host, port, protocol);

  const vs: IstioVirtualService = {
    metadata: {
      name: vsName,
      namespace: istioEgressGatewayNamespace,
      annotations: {
        [`${getSharedAnnotationKey(pkgId)}`]: "user",
      },
    },
    spec: {
      hosts: [host],
      gateways: ["mesh", `${generateGatewayName(host)}`],
      ...(protocol == "TLS" && { tls: routes }),
      ...(protocol == "HTTP" && { http: routes }),
    },
  };

  return vs;
}

// Generates the HTTP/TLS routes for the virtual service
function generateVirtualServiceRoutes(host: string, port: number, protocol: string) {
  const match = [
    {
      gateways: ["mesh"],
      port: port,
      ...(protocol == "TLS" && { sniHosts: [host] }),
    },
    {
      gateways: [`${generateGatewayName(host)}`],
      port: port,
      ...(protocol == "TLS" && { sniHosts: [host] }),
    },
  ];

  return [
    {
      match: [match[0]],
      route: [
        {
          destination: {
            host: `egressgateway.${istioEgressGatewayNamespace}.svc.cluster.local`,
            subset: subsetName,
            port: { number: port },
          },
        },
      ],
    },
    {
      match: [match[1]],
      route: [
        {
          destination: {
            host: `egressgateway.${istioEgressGatewayNamespace}.svc.cluster.local`,
            subset: subsetName,
            port: { number: port },
          },
        },
      ],
    },
  ];
}

// *** What about virtual services that are not added by the operator? ***
// Assumption: Users adding their own Istio resources will need to understand the possible conflicts with the spec. This is not an operation
// blocked by K8s, but will be identified as invalid by Istio. The UDS operator will only manage/deconflict resources it creates or those
// that follow the naming convention.
async function warnMatchingExistingVirtualServices(host: string) {
  const virtualServices = await K8s(IstioVirtualService).Get();

  // Match any virtual services with matching hosts
  for (const vs of virtualServices.items) {
    if (vs.spec && vs.spec.hosts) {
      for (const vsHost of vs.spec.hosts) {
        if (vsHost === host) {
          log.debug(
            `Found existing Virtual Service ${vs.metadata?.name}/${vs.metadata?.namespace} with matching host. Istio will not behave properly with multiple Virtual Services routing the same hosts.`,
          );
          break;
        }
      }
    }
  }
}

function generateEgressVSName(host: string) {
  return sanitizeResourceName(`egress-vs-${host}`);
}
