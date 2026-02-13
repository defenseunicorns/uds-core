/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export {
  Allow,
  Direction,
  Expose,
  Monitor,
  Phase,
  StatusObject as PkgStatus,
  Protocol,
  RemoteGenerated,
  RemoteProtocol,
  Sso,
  Package as UDSPackage,
} from "./generated/package-v1alpha1";

// Type for the standard gateways
export enum Gateway {
  Tenant = "tenant",
  Admin = "admin",
  Passthrough = "passthrough",
}

export {
  ExemptionElement,
  Matcher,
  Kind as MatcherKind,
  Policy,
  Exemption as UDSExemption,
} from "./generated/exemption-v1alpha1";

export {
  Attributes,
  ClusterConfig,
  Expose as ConfigExpose,
  Policy as ConfigPolicy,
  CABundle as ConfigCABundle,
  Phase as ConfigPhase,
  Name as ClusterConfigName,
  Networking,
} from "./generated/clusterconfig-v1alpha1";

export {
  HTTP as IstioHTTP,
  HTTPRoute as IstioHTTPRoute,
  Tl as IstioTLS,
  VirtualService as IstioVirtualService,
} from "./generated/istio/virtualservice-v1beta1";

export {
  Endpoint as IstioEndpoint,
  Location as IstioLocation,
  Port as IstioPort,
  Resolution as IstioResolution,
  ServiceEntry as IstioServiceEntry,
} from "./generated/istio/serviceentry-v1beta1";

export {
  PodMetricsEndpoint as PodMonitorEndpoint,
  Scheme as PodMonitorScheme,
  PodMonitor as PrometheusPodMonitor,
} from "./generated/prometheus/podmonitor-v1";

export {
  ServiceMonitor as PrometheusServiceMonitor,
  Endpoint as ServiceMonitorEndpoint,
  Scheme as ServiceMonitorScheme,
} from "./generated/prometheus/servicemonitor-v1";

export { Probe as PrometheusProbe } from "./generated/prometheus/probe-v1";

export {
  Action as IstioAction,
  AuthorizationPolicy as IstioAuthorizationPolicy,
} from "./generated/istio/authorizationpolicy-v1beta1";
export { RequestAuthentication as IstioRequestAuthentication } from "./generated/istio/requestauthentication-v1";

export { DestinationRule as IstioDestinationRule } from "./generated/istio/destinationrule-v1";

export {
  Gateway as IstioGateway,
  Server as IstioServer,
  Mode as IstioTLSMode,
} from "./generated/istio/gateway-v1";

export {
  OutboundTrafficPolicyMode as IstioOutboundTrafficPolicyMode,
  Sidecar as IstioSidecar,
} from "./generated/istio/sidecar-v1";

export { K8sGateway as K8sGateway, From as K8sGatewayFromType } from "./generated/k8s/gateway-v1";
