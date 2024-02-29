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
  Services = "services",
}

export enum Policy {
  DisallowHostNamespaces = "Disallow_Host_Namespaces",
  DisallowNodePortServices = "Disallow_NodePort_Services",
  DisallowPrivileged = "Disallow_Privileged",
  DisallowSELinuxOptions = "Disallow_SELinux_Options",
  DropAllCapabilities = "Drop_All_Capabilities",
  RequireNonRootUser = "Require_Non_Root_User",
  RestrictCapabilities = "Restrict_Capabilities",
  RestrictExternalNames = "Restrict_External_Names",
  RestrictHostPathWrite = "Restrict_HostPath_Write",
  RestrictHostPorts = "Restrict_Host_Ports",
  RestrictProcMount = "Restrict_Proc_Mount",
  RestrictSELinuxType = "Restrict_SELinux_Type",
  RestrictSeccomp = "Restrict_Seccomp",
  RestrictVolumeTypes = "Restrict_Volume_Types",
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
