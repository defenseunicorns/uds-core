// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

export class Package extends GenericKind {
  spec?: Spec;
  status?: { [key: string]: never };
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
   * Expose a service on an Istio Gateway
   */
  expose?: Expose[];
  /**
   * NetworkPolicy configuration for the package
   */
  policies?: Policies;
}

export interface Expose {
  /**
   * The name of the gateway to expose the service on
   */
  gateway?: Gateway;
  /**
   * The hostname to expose the service on
   */
  host?: string;
  /**
   * The name of the port to expose
   */
  port?: string;
  /**
   * The name of the service to expose
   */
  service?: string;
}

/**
 * The name of the gateway to expose the service on
 */
export enum Gateway {
  Admin = "admin",
  Passthrough = "passthrough",
  Tenant = "tenant",
}

/**
 * NetworkPolicy configuration for the package
 */
export interface Policies {
  /**
   * Allow specific traffic
   */
  allow?: Allow[];
  /**
   * Disable default UDS NetworkPolicy configurations
   */
  disableDefaults?: DisableDefault[];
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
   * The name of the policy
   */
  name: string;
  /**
   * The local pod selector to apply the policy to
   */
  podSelector: PodSelector;
  /**
   * The port to allow
   */
  port?: number;
  /**
   * The protocol (TCP, UDP, or SCTP) to allow. Defaults to TCP.
   */
  protocol?: Protocol;
  /**
   * The remote namespace selector
   */
  remoteNamespaceSelector?: RemoteNamespaceSelector;
  /**
   * The remote pod selector
   */
  remotePodSelector?: RemotePodSelector;
}

/**
 * The direction of the traffic
 */
export enum Direction {
  Egress = "Egress",
  Ingress = "Ingress",
}

/**
 * The local pod selector to apply the policy to
 */
export interface PodSelector {
  /**
   * The labels to match
   */
  matchLabels?: { [key: string]: string };
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
 * The remote namespace selector
 */
export interface RemoteNamespaceSelector {
  /**
   * The labels to match
   */
  matchLabels?: { [key: string]: string };
}

/**
 * The remote pod selector
 */
export interface RemotePodSelector {
  /**
   * The labels to match
   */
  matchLabels?: { [key: string]: string };
}

export enum DisableDefault {
  DNSLookup = "dnsLookup",
  PermissiveNamespace = "permissiveNamespace",
}

RegisterKind(Package, {
  group: "uds.dev",
  version: "v1alpha1",
  kind: "Package",
});
