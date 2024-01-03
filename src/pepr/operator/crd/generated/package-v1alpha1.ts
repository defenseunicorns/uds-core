// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

export class Package extends GenericKind {
  spec?: Spec;
  status?: Status;
}

export interface Spec {
  /**
   * Network configuration for the package
   */
  network?: Network;
}

/**
 * Network configuration for the package
 */
export interface Network {
  /**
   * Allow specific traffic (namespace will have a default-deny policy)
   */
  allow?: Allow[];
  /**
   * Expose a service on an Istio Gateway
   */
  expose?: Expose[];
}

export interface Allow {
  /**
   * The direction of the traffic
   */
  direction: Direction;
  /**
   * The labels to apply to the policy
   */
  labels?: { [key: string]: string };
  /**
   * Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all
   * pods in the namespace
   */
  podLabels?: { [key: string]: string };
  /**
   * The port to allow
   */
  port?: number;
  /**
   * The protocol (TCP, UDP, or SCTP) to allow. Defaults to TCP.
   */
  protocol?: Protocol;
  /**
   * Custom generated remote selector for the policy
   */
  remoteGenerated?: RemoteGenerated;
  /**
   * The remote namespace selector labels
   */
  remoteNamespaceLabels?: { [key: string]: string };
  /**
   * The remote pod selector labels
   */
  remotePodLabels?: { [key: string]: string };
}

/**
 * The direction of the traffic
 */
export enum Direction {
  Egress = "Egress",
  Ingress = "Ingress",
}

/**
 * The protocol (TCP, UDP, or SCTP) to allow. Defaults to TCP.
 */
export enum Protocol {
  SCTP = "SCTP",
  TCP = "TCP",
  UDP = "UDP",
}

/**
 * Custom generated remote selector for the policy
 */
export enum RemoteGenerated {
  IntraNamespace = "IntraNamespace",
  KubeAPI = "KubeAPI",
}

export interface Expose {
  /**
   * The name of the gateway to expose the service on (default: tenant)
   */
  gateway?: Gateway;
  /**
   * The hostname to expose the service on
   */
  host: string;
  /**
   * The mode to use when exposing the service
   */
  mode?: Mode;
  /**
   * Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all
   * pods in the namespace
   */
  podLabels: { [key: string]: string };
  /**
   * The port number to expose
   */
  port: number;
  /**
   * The name of the service to expose
   */
  service: string;
}

/**
 * The name of the gateway to expose the service on (default: tenant)
 */
export enum Gateway {
  Admin = "admin",
  Passthrough = "passthrough",
  Tenant = "tenant",
}

/**
 * The mode to use when exposing the service
 */
export enum Mode {
  HTTP = "http",
  TCP = "tcp",
}

export interface Status {
  endpoints?: string[];
  networkPolicyCount?: number;
  observedGeneration?: number;
  phase?: Phase;
}

export enum Phase {
  Failed = "Failed",
  Pending = "Pending",
  Ready = "Ready",
}

RegisterKind(Package, {
  group: "uds.dev",
  version: "v1alpha1",
  kind: "Package",
});
