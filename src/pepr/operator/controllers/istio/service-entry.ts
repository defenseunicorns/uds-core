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
 * @param expose - Expose configuration from the package
 * @param namespace - The namespace of the service
 * @param pkgName - The name of the package
 * @param generation - The generation of the package
 * @param ownerRefs - Owner references for the ServiceEntry
 * @returns A ServiceEntry object for Istio configuration
 */
export function generateServiceEntry(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  // Destructure fields from 'expose', with default values for gateway and location
  const { gateway = Gateway.Tenant, host, location = "MESH_INTERNAL" } = expose;

  // Generate a sanitized name for the ServiceEntry
  const name = generateSEName(pkgName, expose);

  // Get the correct domain based on gateway
  const domain = gateway === Gateway.Admin ? UDSConfig.adminDomain : UDSConfig.domain;

  // Determine the Fully Qualified Domain Name (FQDN) for the service
  // For internal services (MESH_INTERNAL), append the domain to the host
  // For external services (MESH_EXTERNAL), use the host directly as provided in the Expose configuration
  const fqdn = location === "MESH_INTERNAL" ? `${host}.${domain}` : host;

  // Define the service port for HTTPS traffic
  const serviceEntryPort: IstioPort = {
    name: "https",
    number: 443,
    protocol: "HTTPS",
  };

  // Define the service entry endpoint
  // If the service is external (MESH_EXTERNAL), no specific endpoint is needed (DNS-based resolution)
  // If internal, map the gateway (admin, passthrough, or tenant) to the ServiceEntry using the gateway-specific address
  const serviceEntryEndpoint: IstioEndpoint = {
    address:
      location === "MESH_EXTERNAL"
        ? undefined
        : `${gateway}-ingressgateway.istio-${gateway}-gateway.svc.cluster.local`,
  };

  // Construct the ServiceEntry payload object
  const payload: IstioServiceEntry = {
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      // Use the Custom Resource (CR) as the owner reference for each ServiceEntry
      ownerReferences: ownerRefs,
    },
    spec: {
      hosts: [fqdn], // The host(s) this ServiceEntry applies to
      location: location as IstioLocation, // Set the service location (internal or external)
      resolution: IstioResolution.DNS, // Set the resolution type based on the service location
      ports: [serviceEntryPort], // Define ports for the service
      endpoints: location === "MESH_EXTERNAL" ? [] : [serviceEntryEndpoint], // Define endpoints if internal
    },
  };

  return payload;
}

/**
 * Generates a sanitized name for the ServiceEntry
 *
 * @param pkgName - The name of the package
 * @param expose - Expose configuration
 * @returns A sanitized resource name suitable for use in Kubernetes metadata
 */
export function generateSEName(pkgName: string, expose: Expose) {
  const { gateway = Gateway.Tenant, host } = expose;

  // Combine package name, gateway, and host to create a unique resource name
  // Sanitize the name to ensure it is a valid Kubernetes resource name
  const name = sanitizeResourceName(`${pkgName}-${gateway}-${host}`);

  return name;
}
