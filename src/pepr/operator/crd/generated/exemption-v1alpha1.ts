// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

export class Exemption extends GenericKind {
  spec?: Spec;
  status?: Status;
}

export interface Spec {
  /**
   * Policy exemptions
   */
  exemptions?: ExemptionElement[];
}

export interface ExemptionElement {
  /**
   * Reasons as to why this exemption is needed
   */
  description?: string;
  /**
   * Resource to exempt (Regex allowed for name)
   */
  matcher: Matcher;
  /**
   * A list of policies to override
   */
  policies: Policy[];
  /**
   * title to give the exemption for reporting purposes
   */
  title?: string;
}

/**
 * Resource to exempt (Regex allowed for name)
 */
export interface Matcher {
  kind?: Kind;
  name: string;
  namespace: string;
}

export enum Kind {
  Pod = "pod",
  Service = "service",
}

export enum Policy {
  DisallowHostNamespaces = "DisallowHostNamespaces",
  DisallowNodePortServices = "DisallowNodePortServices",
  DisallowPrivileged = "DisallowPrivileged",
  DisallowSELinuxOptions = "DisallowSELinuxOptions",
  DropAllCapabilities = "Drop_AllCapabilities",
  RequireNonRootUser = "RequireNonRootUser",
  RestrictCapabilities = "RestrictCapabilities",
  RestrictExternalNames = "RestrictExternalNames",
  RestrictHostPathWrite = "RestrictHostPathWrite",
  RestrictHostPorts = "RestrictHostPorts",
  RestrictProcMount = "RestrictProcMount",
  RestrictSELinuxType = "RestrictSELinuxType",
  RestrictSeccomp = "RestrictSeccomp",
  RestrictVolumeTypes = "RestrictVolumeTypes",
}

export interface Status {
  observedGeneration?: number;
  phase?: Phase;
  titles?: string[];
}

export enum Phase {
  Failed = "Failed",
  Pending = "Pending",
  Ready = "Ready",
}

RegisterKind(Exemption, {
  group: "uds.dev",
  version: "v1alpha1",
  kind: "Exemption",
});
