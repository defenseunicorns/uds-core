/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

export class ServiceEntry extends GenericKind {
  /**
   * Configuration affecting service registry. See more details at:
   * https://istio.io/docs/reference/config/networking/service-entry.html
   */
  spec?: Spec;
  status?: { [key: string]: any };
}

/**
 * Configuration affecting service registry. See more details at:
 * https://istio.io/docs/reference/config/networking/service-entry.html
 */
export interface Spec {
  /**
   * The virtual IP addresses associated with the service.
   */
  addresses?: string[];
  /**
   * One or more endpoints associated with the service.
   */
  endpoints?: Endpoint[];
  /**
   * A list of namespaces to which this service is exported.
   */
  exportTo?: string[];
  /**
   * The hosts associated with the ServiceEntry.
   */
  hosts: string[];
  /**
   * Specify whether the service should be considered external to the mesh or part of the mesh.
   */
  location?: Location;
  /**
   * The ports associated with the external service.
   */
  ports?: Port[];
  /**
   * Service resolution mode for the hosts.
   */
  resolution?: Resolution;
  /**
   * If specified, the proxy will verify that the server certificate's subject alternate name
   * matches one of the specified values.
   */
  subjectAltNames?: string[];
  /**
   * Applicable only for MESH_INTERNAL services.
   */
  workloadSelector?: WorkloadSelector;
}

export interface Endpoint {
  /**
   * Address associated with the network endpoint without the port.
   */
  address?: string;
  /**
   * One or more labels associated with the endpoint.
   */
  labels?: { [key: string]: string };
  /**
   * The locality associated with the endpoint.
   */
  locality?: string;
  /**
   * Network enables Istio to group endpoints resident in the same L3 domain/network.
   */
  network?: string;
  /**
   * Set of ports associated with the endpoint.
   */
  ports?: { [key: string]: number };
  /**
   * The service account associated with the workload if a sidecar is present in the workload.
   */
  serviceAccount?: string;
  /**
   * The load balancing weight associated with the endpoint.
   */
  weight?: number;
}

/**
 * Specify whether the service should be considered external to the mesh or part of the mesh.
 */
export enum Location {
  MeshExternal = "MESH_EXTERNAL",
  MeshInternal = "MESH_INTERNAL",
}

export interface Port {
  /**
   * Label assigned to the port.
   */
  name: string;
  /**
   * A valid non-negative integer port number.
   */
  number: number;
  /**
   * The protocol exposed on the port.
   */
  protocol?: string;
  /**
   * The port number on the endpoint where the traffic will be received.
   */
  targetPort?: number;
}

/**
 * Service resolution mode for the hosts.
 */
export enum Resolution {
  DNS = "DNS",
  DNSRoundRobin = "DNS_ROUND_ROBIN",
  None = "NONE",
  Static = "STATIC",
}

/**
 * Applicable only for MESH_INTERNAL services.
 */
export interface WorkloadSelector {
  /**
   * One or more labels that indicate a specific set of pods/VMs on which the configuration
   * should be applied.
   */
  labels?: { [key: string]: string };
}

RegisterKind(ServiceEntry, {
  group: "networking.istio.io",
  version: "v1beta1",
  kind: "ServiceEntry",
  plural: "serviceentries",
});
