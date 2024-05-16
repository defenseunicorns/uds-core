import { UDSConfig } from "../../../config";
import { V1OwnerReference } from "@kubernetes/client-node";
import {
  Expose,
  Gateway,
  IstioServiceEntry,
  IstioLocation,
  IstioResolution,
  IstioPort,
  IstioEndpoint,
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

  // For the admin gateway, we need to add the path prefix
  const domain = (gateway === Gateway.Admin ? "admin." : "") + UDSConfig.domain;

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
