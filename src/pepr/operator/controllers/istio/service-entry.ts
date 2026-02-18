/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";

import {
  Expose,
  Gateway,
  IstioEndpoint,
  IstioLocation,
  IstioPort,
  IstioResolution,
  IstioServiceEntry,
} from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { getFqdn } from "../domain-utils";
import { sanitizeResourceName } from "../utils";
import { egressWaypointName } from "./ambient-waypoint";
import {
  sidecarEgressNamespace,
  sharedEgressPkgId as sidecarSharedEgressPkgId,
} from "./egress-sidecar";
import {
  ambientEgressNamespace,
  sharedEgressPkgId as ambientSharedEgressPkgId,
  getSharedAnnotationKey,
} from "./istio-resources";
import { EgressResource, HostResource, PortProtocol } from "./types";

// Convert PortProtocol[] to IstioPort[] consistently
function buildIstioPorts(portProtocols: PortProtocol[]): IstioPort[] {
  return portProtocols.map(pp => ({
    name: `${pp.protocol.toLowerCase()}-${pp.port.toString()}`,
    number: pp.port,
    protocol: pp.protocol,
  }));
}

// Build owner annotations from contributing packages
function buildOwnerAnnotations(resource: EgressResource): Record<string, string> {
  const annotations: Record<string, string> = {};
  for (const pkgId of resource.packages) {
    annotations[getSharedAnnotationKey(pkgId)] = "user";
  }
  return annotations;
}

/**
 * Creates a ServiceEntry for each exposed service in the package
 *
 * @param pkg
 * @param namespace
 */
export function generateIngressServiceEntry(
  expose: Expose,
  namespace: string,
  pkgName: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  const { gateway = Gateway.Tenant } = expose;

  const name = generateSEName(pkgName, expose);
  const fqdn = getFqdn(expose);

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
  const sanitizedHost = host === "." ? "root-domain" : host;
  const name = sanitizeResourceName(`${pkgName}-${gateway}-${sanitizedHost}`);

  return name;
}

/**
 * Creates a ServiceEntry for allowed external hosts in the package
 *
 * @param host
 * @param hostResource
 * @param pkgName
 * @param namespace
 * @param generation
 * @param ownerRefs
 */
export function generateLocalEgressServiceEntry(
  host: string,
  hostResource: HostResource,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
  istioMode: Mode,
) {
  const { portProtocol } = hostResource;

  const name = generateLocalEgressSEName(pkgName, portProtocol, host);

  // Update the ports array
  const ports: IstioPort[] = buildIstioPorts(portProtocol);

  const serviceEntry: IstioServiceEntry = {
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
      hosts: [host],
      location: IstioLocation.MeshExternal,
      resolution: IstioResolution.DNS,
      ports,
      exportTo: ["."],
    },
  };

  // If ambient, add labels for service entry to use waypoint proxy
  if (istioMode === Mode.Ambient) {
    serviceEntry.metadata!.labels!["istio.io/use-waypoint"] = egressWaypointName;
    serviceEntry.metadata!.labels!["istio.io/use-waypoint-namespace"] = ambientEgressNamespace;
  }

  return serviceEntry;
}

export function generateSharedServiceEntry(
  host: string,
  resource: EgressResource,
  generation: number,
) {
  const name = generateSharedEgressSEName(host);

  // Add annotations from resource
  const annotations: Record<string, string> = buildOwnerAnnotations(resource);

  // Add the gateway servers
  const ports = buildIstioPorts(resource.portProtocols);

  const serviceEntry: IstioServiceEntry = {
    metadata: {
      name,
      namespace: sidecarEgressNamespace,
      annotations,
      labels: {
        "uds/package": sidecarSharedEgressPkgId,
        "uds/generation": generation.toString(),
      },
    },
    spec: {
      hosts: [host],
      location: IstioLocation.MeshExternal,
      resolution: IstioResolution.DNS,
      ports,
      exportTo: ["."],
    },
  };

  return serviceEntry;
}

export function generateLocalEgressSEName(
  pkgName: string,
  portProtocol: PortProtocol[],
  host: string,
) {
  const ppString = portProtocol
    .map(pp => `${pp.port.toString()}-${pp.protocol.toLowerCase()}`)
    .join("-");
  return sanitizeResourceName(`${pkgName}-egress-${host}-${ppString}`);
}

function generateSharedEgressSEName(host: string) {
  return sanitizeResourceName(`service-entry-${host}`);
}

/**
 * Creates a shared Ambient ServiceEntry per external host in the egress waypoint namespace.
 * - Namespace: istio-egress-ambient
 * - Binds to the shared ambient egress waypoint via labels
 * - Carries ownership annotations for contributing packages
 * - Labeled for generation-based purge
 */
export function generateSharedAmbientServiceEntry(
  host: string,
  resource: EgressResource,
  generation: number,
): IstioServiceEntry {
  const name = sanitizeResourceName(`ambient-se-${host}`);

  // Add annotations from contributing packages
  const annotations: Record<string, string> = buildOwnerAnnotations(resource);

  const ports: IstioPort[] = buildIstioPorts(resource.portProtocols);

  const se: IstioServiceEntry = {
    metadata: {
      name,
      namespace: ambientEgressNamespace,
      annotations,
      labels: {
        // Bind to ambient egress waypoint
        "istio.io/use-waypoint": egressWaypointName,
        "istio.io/use-waypoint-namespace": ambientEgressNamespace,
        // Managed by shared ambient egress controller
        "uds/package": ambientSharedEgressPkgId,
        "uds/generation": generation.toString(),
      },
    },
    spec: {
      hosts: [host],
      location: IstioLocation.MeshExternal,
      resolution: IstioResolution.DNS,
      ports,
      exportTo: ["."],
    },
  };

  return se;
}
