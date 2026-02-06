/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export type {
  Allow,
  Expose,
  Monitor,
  StatusObject as PkgStatus,
  Sso,
} from "./generated/package-v1alpha1.ts";
export {
  Direction,
  Phase,
  Protocol,
  RemoteGenerated,
  RemoteProtocol,
  Package as UDSPackage,
} from "./generated/package-v1alpha1.ts";

// Type for the standard gateways
export enum Gateway {
  Tenant = "tenant",
  Admin = "admin",
  Passthrough = "passthrough",
}

export type { ExemptionElement, Matcher } from "./generated/exemption-v1alpha1.ts";
export {
  Kind as MatcherKind,
  Policy,
  Exemption as UDSExemption,
} from "./generated/exemption-v1alpha1.ts";

export type {
  Attributes,
  Expose as ConfigExpose,
  Policy as ConfigPolicy,
  CABundle as ConfigCABundle,
  Networking,
} from "./generated/clusterconfig-v1alpha1.ts";
export {
  ClusterConfig,
  Phase as ConfigPhase,
  Name as ClusterConfigName,
} from "./generated/clusterconfig-v1alpha1.ts";

export type {
  HTTP as IstioHTTP,
  HTTPRoute as IstioHTTPRoute,
  Tl as IstioTLS,
} from "./generated/istio/virtualservice-v1beta1.ts";
export { VirtualService as IstioVirtualService } from "./generated/istio/virtualservice-v1beta1.ts";

export type {
  Endpoint as IstioEndpoint,
  Port as IstioPort,
} from "./generated/istio/serviceentry-v1beta1.ts";
export {
  Location as IstioLocation,
  Resolution as IstioResolution,
  ServiceEntry as IstioServiceEntry,
} from "./generated/istio/serviceentry-v1beta1.ts";

export type { PodMetricsEndpoint as PodMonitorEndpoint } from "./generated/prometheus/podmonitor-v1.ts";
export {
  Scheme as PodMonitorScheme,
  PodMonitor as PrometheusPodMonitor,
} from "./generated/prometheus/podmonitor-v1.ts";

export type { Endpoint as ServiceMonitorEndpoint } from "./generated/prometheus/servicemonitor-v1.ts";
export {
  ServiceMonitor as PrometheusServiceMonitor,
  Scheme as ServiceMonitorScheme,
} from "./generated/prometheus/servicemonitor-v1.ts";

export {
  Action as IstioAction,
  AuthorizationPolicy as IstioAuthorizationPolicy,
} from "./generated/istio/authorizationpolicy-v1beta1.ts";
export { RequestAuthentication as IstioRequestAuthentication } from "./generated/istio/requestauthentication-v1.ts";

export { DestinationRule as IstioDestinationRule } from "./generated/istio/destinationrule-v1.ts";

export type { Server as IstioServer } from "./generated/istio/gateway-v1.ts";
export { Gateway as IstioGateway, Mode as IstioTLSMode } from "./generated/istio/gateway-v1.ts";

export {
  OutboundTrafficPolicyMode as IstioOutboundTrafficPolicyMode,
  Sidecar as IstioSidecar,
} from "./generated/istio/sidecar-v1.ts";
export {
  K8sGateway as K8sGateway,
  From as K8sGatewayFromType,
} from "./generated/k8s/gateway-v1.ts";
