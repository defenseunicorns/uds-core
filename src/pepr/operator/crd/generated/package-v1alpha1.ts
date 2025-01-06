/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// This file is auto-generated by kubernetes-fluent-client, do not edit manually
import { GenericKind, RegisterKind } from "kubernetes-fluent-client";
export class Package extends GenericKind {
  spec?: Spec;
  status?: Status;
}

export interface Spec {
  /**
   * Create Service or Pod Monitor configurations
   */
  monitor?: Monitor[];
  /**
   * Network configuration for the package
   */
  network?: Network;
  /**
   * Create SSO client configurations
   */
  sso?: Sso[];
}

export interface Monitor {
  /**
   * Authorization settings.
   */
  authorization?: Authorization;
  /**
   * A description of this monitor entry, this will become part of the ServiceMonitor name
   */
  description?: string;
  /**
   * The protocol for Prometheus to use if a scrape returns a blank, unparsable, or otherwise
   * invalid Content-Type
   */
  fallbackScrapeProtocol?: FallbackScrapeProtocol;
  /**
   * The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the
   * default.
   */
  kind?: Kind;
  /**
   * HTTP path from which to scrape for metrics, defaults to `/metrics`
   */
  path?: string;
  /**
   * Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all
   * pods in the namespace
   */
  podSelector?: { [key: string]: string };
  /**
   * The port name for the serviceMonitor
   */
  portName: string;
  /**
   * Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all
   * pods in the namespace
   */
  selector: { [key: string]: string };
  /**
   * The service targetPort. This is required so the NetworkPolicy can be generated correctly.
   */
  targetPort: number;
}

/**
 * Authorization settings.
 */
export interface Authorization {
  /**
   * Selects a key of a Secret in the namespace that contains the credentials for
   * authentication.
   */
  credentials: Credentials;
  /**
   * Defines the authentication type. The value is case-insensitive. "Basic" is not a
   * supported value. Default: "Bearer"
   */
  type?: string;
}

/**
 * Selects a key of a Secret in the namespace that contains the credentials for
 * authentication.
 */
export interface Credentials {
  /**
   * The key of the secret to select from. Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent. More info:
   * https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * The protocol for Prometheus to use if a scrape returns a blank, unparsable, or otherwise
 * invalid Content-Type
 */
export enum FallbackScrapeProtocol {
  OpenMetricsText001 = "OpenMetricsText0.0.1",
  OpenMetricsText100 = "OpenMetricsText1.0.0",
  PrometheusProto = "PrometheusProto",
  PrometheusText004 = "PrometheusText0.0.4",
  PrometheusText100 = "PrometheusText1.0.0",
}

/**
 * The type of monitor to create; PodMonitor or ServiceMonitor. ServiceMonitor is the
 * default.
 */
export enum Kind {
  PodMonitor = "PodMonitor",
  ServiceMonitor = "ServiceMonitor",
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
   * A description of the policy, this will become part of the policy name
   */
  description?: string;
  /**
   * The direction of the traffic
   */
  direction: Direction;
  /**
   * The labels to apply to the policy
   */
  labels?: { [key: string]: string };
  /**
   * Deprecated: use selector
   */
  podLabels?: { [key: string]: string };
  /**
   * The port to allow (protocol is always TCP)
   */
  port?: number;
  /**
   * A list of ports to allow (protocol is always TCP)
   */
  ports?: number[];
  /**
   * Custom generated policy CIDR
   */
  remoteCidr?: string;
  /**
   * Custom generated remote selector for the policy
   */
  remoteGenerated?: RemoteGenerated;
  /**
   * The remote namespace to allow traffic to/from. Use * or empty string to allow all
   * namespaces
   */
  remoteNamespace?: string;
  /**
   * Deprecated: use remoteSelector
   */
  remotePodLabels?: { [key: string]: string };
  /**
   * The remote pod selector labels to allow traffic to/from
   */
  remoteSelector?: { [key: string]: string };
  /**
   * Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all
   * pods in the namespace
   */
  selector?: { [key: string]: string };
}

/**
 * The direction of the traffic
 */
export enum Direction {
  Egress = "Egress",
  Ingress = "Ingress",
}

/**
 * Custom generated remote selector for the policy
 */
export enum RemoteGenerated {
  Anywhere = "Anywhere",
  CloudMetadata = "CloudMetadata",
  IntraNamespace = "IntraNamespace",
  KubeAPI = "KubeAPI",
  KubeNodes = "KubeNodes",
}

export interface Expose {
  /**
   * Advanced HTTP settings for the route.
   */
  advancedHTTP?: AdvancedHTTP;
  /**
   * A description of this expose entry, this will become part of the VirtualService name
   */
  description?: string;
  /**
   * The name of the gateway to expose the service on (default: tenant)
   */
  gateway?: Gateway;
  /**
   * The hostname to expose the service on
   */
  host: string;
  /**
   * Match the incoming request based on custom rules. Not permitted when using the
   * passthrough gateway.
   */
  match?: ExposeMatch[];
  /**
   * Deprecated: use selector
   */
  podLabels?: { [key: string]: string };
  /**
   * The port number to expose
   */
  port?: number;
  /**
   * Labels to match pods in the namespace to apply the policy to. Leave empty to apply to all
   * pods in the namespace
   */
  selector?: { [key: string]: string };
  /**
   * The name of the service to expose
   */
  service?: string;
  /**
   * The service targetPort. This defaults to port and is only required if the service port is
   * different from the target port (so the NetworkPolicy can be generated correctly).
   */
  targetPort?: number;
}

/**
 * Advanced HTTP settings for the route.
 */
export interface AdvancedHTTP {
  /**
   * Cross-Origin Resource Sharing policy (CORS).
   */
  corsPolicy?: CorsPolicy;
  /**
   * A HTTP rule can either return a direct_response, redirect or forward (default) traffic.
   */
  directResponse?: DirectResponse;
  headers?: Headers;
  /**
   * Match the incoming request based on custom rules. Not permitted when using the
   * passthrough gateway.
   */
  match?: AdvancedHTTPMatch[];
  /**
   * A HTTP rule can either return a direct_response, redirect or forward (default) traffic.
   */
  redirect?: Redirect;
  /**
   * Retry policy for HTTP requests.
   */
  retries?: Retries;
  /**
   * Rewrite HTTP URIs and Authority headers.
   */
  rewrite?: Rewrite;
  /**
   * Timeout for HTTP requests, default is disabled.
   */
  timeout?: string;
  /**
   * Weight specifies the relative proportion of traffic to be forwarded to the destination.
   */
  weight?: number;
}

/**
 * Cross-Origin Resource Sharing policy (CORS).
 */
export interface CorsPolicy {
  /**
   * Indicates whether the caller is allowed to send the actual request (not the preflight)
   * using credentials.
   */
  allowCredentials?: boolean;
  /**
   * List of HTTP headers that can be used when requesting the resource.
   */
  allowHeaders?: string[];
  /**
   * List of HTTP methods allowed to access the resource.
   */
  allowMethods?: string[];
  allowOrigin?: string[];
  /**
   * String patterns that match allowed origins.
   */
  allowOrigins?: AllowOrigin[];
  /**
   * A list of HTTP headers that the browsers are allowed to access.
   */
  exposeHeaders?: string[];
  /**
   * Specifies how long the results of a preflight request can be cached.
   */
  maxAge?: string;
}

export interface AllowOrigin {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

/**
 * A HTTP rule can either return a direct_response, redirect or forward (default) traffic.
 */
export interface DirectResponse {
  /**
   * Specifies the content of the response body.
   */
  body?: Body;
  /**
   * Specifies the HTTP response status to be returned.
   */
  status: number;
}

/**
 * Specifies the content of the response body.
 */
export interface Body {
  /**
   * response body as base64 encoded bytes.
   */
  bytes?: string;
  string?: string;
}

export interface Headers {
  request?: Request;
  response?: Response;
}

export interface Request {
  add?: { [key: string]: string };
  remove?: string[];
  set?: { [key: string]: string };
}

export interface Response {
  add?: { [key: string]: string };
  remove?: string[];
  set?: { [key: string]: string };
}

export interface AdvancedHTTPMatch {
  /**
   * Flag to specify whether the URI matching should be case-insensitive.
   */
  ignoreUriCase?: boolean;
  method?: PurpleMethod;
  /**
   * The name assigned to a match.
   */
  name: string;
  /**
   * Query parameters for matching.
   */
  queryParams?: { [key: string]: PurpleQueryParam };
  uri?: PurpleURI;
}

export interface PurpleMethod {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

export interface PurpleQueryParam {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

export interface PurpleURI {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

/**
 * A HTTP rule can either return a direct_response, redirect or forward (default) traffic.
 */
export interface Redirect {
  /**
   * On a redirect, overwrite the Authority/Host portion of the URL with this value.
   */
  authority?: string;
  /**
   * On a redirect, dynamically set the port: * FROM_PROTOCOL_DEFAULT: automatically set to 80
   * for HTTP and 443 for HTTPS.
   *
   * Valid Options: FROM_PROTOCOL_DEFAULT, FROM_REQUEST_PORT
   */
  derivePort?: DerivePort;
  /**
   * On a redirect, overwrite the port portion of the URL with this value.
   */
  port?: number;
  /**
   * On a redirect, Specifies the HTTP status code to use in the redirect response.
   */
  redirectCode?: number;
  /**
   * On a redirect, overwrite the scheme portion of the URL with this value.
   */
  scheme?: string;
  /**
   * On a redirect, overwrite the Path portion of the URL with this value.
   */
  uri?: string;
}

/**
 * On a redirect, dynamically set the port: * FROM_PROTOCOL_DEFAULT: automatically set to 80
 * for HTTP and 443 for HTTPS.
 *
 * Valid Options: FROM_PROTOCOL_DEFAULT, FROM_REQUEST_PORT
 */
export enum DerivePort {
  FromProtocolDefault = "FROM_PROTOCOL_DEFAULT",
  FromRequestPort = "FROM_REQUEST_PORT",
}

/**
 * Retry policy for HTTP requests.
 */
export interface Retries {
  /**
   * Number of retries to be allowed for a given request.
   */
  attempts?: number;
  /**
   * Timeout per attempt for a given request, including the initial call and any retries.
   */
  perTryTimeout?: string;
  /**
   * Specifies the conditions under which retry takes place.
   */
  retryOn?: string;
  /**
   * Flag to specify whether the retries should retry to other localities.
   */
  retryRemoteLocalities?: boolean;
}

/**
 * Rewrite HTTP URIs and Authority headers.
 */
export interface Rewrite {
  /**
   * rewrite the Authority/Host header with this value.
   */
  authority?: string;
  /**
   * rewrite the path (or the prefix) portion of the URI with this value.
   */
  uri?: string;
  /**
   * rewrite the path portion of the URI with the specified regex.
   */
  uriRegexRewrite?: URIRegexRewrite;
}

/**
 * rewrite the path portion of the URI with the specified regex.
 */
export interface URIRegexRewrite {
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  match?: string;
  /**
   * The string that should replace into matching portions of original URI.
   */
  rewrite?: string;
}

/**
 * The name of the gateway to expose the service on (default: tenant)
 */
export enum Gateway {
  Admin = "admin",
  Passthrough = "passthrough",
  Tenant = "tenant",
}

export interface ExposeMatch {
  /**
   * Flag to specify whether the URI matching should be case-insensitive.
   */
  ignoreUriCase?: boolean;
  method?: FluffyMethod;
  /**
   * The name assigned to a match.
   */
  name: string;
  /**
   * Query parameters for matching.
   */
  queryParams?: { [key: string]: FluffyQueryParam };
  uri?: FluffyURI;
}

export interface FluffyMethod {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

export interface FluffyQueryParam {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

export interface FluffyURI {
  exact?: string;
  prefix?: string;
  /**
   * RE2 style regex-based match (https://github.com/google/re2/wiki/Syntax).
   */
  regex?: string;
}

export interface Sso {
  /**
   * Always list this client in the Account UI, even if the user does not have an active
   * session.
   */
  alwaysDisplayInConsole?: boolean;
  /**
   * Specifies attributes for the client.
   */
  attributes?: { [key: string]: string };
  /**
   * The client authenticator type
   */
  clientAuthenticatorType?: ClientAuthenticatorType;
  /**
   * The client identifier registered with the identity provider.
   */
  clientId: string;
  /**
   * Default client scopes
   */
  defaultClientScopes?: string[];
  /**
   * A description for the client, can be a URL to an image to replace the login logo
   */
  description?: string;
  /**
   * Labels to match pods to automatically protect with authservice. Leave empty to disable
   * authservice protection
   */
  enableAuthserviceSelector?: { [key: string]: string };
  /**
   * Whether the SSO client is enabled
   */
  enabled?: boolean;
  /**
   * The client SSO group type
   */
  groups?: Groups;
  /**
   * Specifies display name of the client
   */
  name: string;
  /**
   * Specifies the protocol of the client, either 'openid-connect' or 'saml'
   */
  protocol?: Protocol;
  /**
   * Protocol Mappers to configure on the client
   */
  protocolMappers?: ProtocolMapper[];
  /**
   * Defines whether the client requires a client secret for authentication
   */
  publicClient?: boolean;
  /**
   * Valid URI pattern a browser can redirect to after a successful login. Simple wildcards
   * are allowed such as 'https://unicorns.uds.dev/*'
   */
  redirectUris?: string[];
  /**
   * Root URL appended to relative URLs
   */
  rootUrl?: string;
  /**
   * The client secret. Typically left blank and auto-generated.
   */
  secret?: string;
  /**
   * The name of the secret to store the client secret
   */
  secretName?: string;
  /**
   * A template for the generated secret
   */
  secretTemplate?: { [key: string]: string };
  /**
   * Enables the client credentials grant based authentication via OpenID Connect protocol.
   */
  serviceAccountsEnabled?: boolean;
  /**
   * Enables the standard OpenID Connect redirect based authentication with authorization code.
   */
  standardFlowEnabled?: boolean;
  /**
   * Allowed CORS origins. To permit all origins of Valid Redirect URIs, add '+'. This does
   * not include the '*' wildcard though. To permit all origins, explicitly add '*'.
   */
  webOrigins?: string[];
}

/**
 * The client authenticator type
 */
export enum ClientAuthenticatorType {
  ClientJwt = "client-jwt",
  ClientSecret = "client-secret",
}

/**
 * The client SSO group type
 */
export interface Groups {
  /**
   * List of groups allowed to access the client
   */
  anyOf?: string[];
}

/**
 * Specifies the protocol of the client, either 'openid-connect' or 'saml'
 *
 * Protocol of the mapper
 */
export enum Protocol {
  OpenidConnect = "openid-connect",
  Saml = "saml",
}

export interface ProtocolMapper {
  /**
   * Configuration options for the mapper.
   */
  config?: { [key: string]: string };
  /**
   * Whether user consent is required for this mapper
   */
  consentRequired?: boolean;
  /**
   * Name of the mapper
   */
  name: string;
  /**
   * Protocol of the mapper
   */
  protocol: Protocol;
  /**
   * Protocol Mapper type of the mapper
   */
  protocolMapper: string;
}

export interface Status {
  authserviceClients?: string[];
  endpoints?: string[];
  monitors?: string[];
  networkPolicyCount?: number;
  observedGeneration?: number;
  phase?: Phase;
  retryAttempt?: number;
  ssoClients?: string[];
}

export enum Phase {
  Failed = "Failed",
  Pending = "Pending",
  Ready = "Ready",
  Removing = "Removing",
  Retrying = "Retrying",
}

RegisterKind(Package, {
  group: "uds.dev",
  version: "v1alpha1",
  kind: "Package",
  plural: "packages",
});
