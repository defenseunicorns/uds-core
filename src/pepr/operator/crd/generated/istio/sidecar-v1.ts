// This file is auto-generated by kubernetes-fluent-client, do not edit manually
import { GenericKind, RegisterKind } from "kubernetes-fluent-client";
export class Sidecar extends GenericKind {
  /**
   * Configuration affecting network reachability of a sidecar. See more details at:
   * https://istio.io/docs/reference/config/networking/sidecar.html
   */
  spec?: Spec;
  status?: Status;
}

/**
 * Configuration affecting network reachability of a sidecar. See more details at:
 * https://istio.io/docs/reference/config/networking/sidecar.html
 */
export interface Spec {
  /**
   * Egress specifies the configuration of the sidecar for processing outbound traffic from
   * the attached workload instance to other services in the mesh.
   */
  egress?: Egress[];
  /**
   * Settings controlling the volume of connections Envoy will accept from the network.
   */
  inboundConnectionPool?: InboundConnectionPool;
  /**
   * Ingress specifies the configuration of the sidecar for processing inbound traffic to the
   * attached workload instance.
   */
  ingress?: Ingress[];
  /**
   * Set the default behavior of the sidecar for handling outbound traffic from the
   * application.
   */
  outboundTrafficPolicy?: OutboundTrafficPolicy;
  /**
   * Criteria used to select the specific set of pods/VMs on which this `Sidecar`
   * configuration should be applied.
   */
  workloadSelector?: WorkloadSelector;
}

export interface Egress {
  /**
   * The IP(IPv4 or IPv6) or the Unix domain socket to which the listener should be bound to.
   */
  bind?: string;
  /**
   * When the bind address is an IP, the captureMode option dictates how traffic to the
   * listener is expected to be captured (or not).
   *
   * Valid Options: DEFAULT, IPTABLES, NONE
   */
  captureMode?: CaptureMode;
  /**
   * One or more service hosts exposed by the listener in `namespace/dnsName` format.
   */
  hosts: string[];
  /**
   * The port associated with the listener.
   */
  port?: EgressPort;
}

/**
 * When the bind address is an IP, the captureMode option dictates how traffic to the
 * listener is expected to be captured (or not).
 *
 * Valid Options: DEFAULT, IPTABLES, NONE
 *
 * The captureMode option dictates how traffic to the listener is expected to be captured
 * (or not).
 *
 * Valid Options: DEFAULT, IPTABLES, NONE
 */
export enum CaptureMode {
  Default = "DEFAULT",
  Iptables = "IPTABLES",
  None = "NONE",
}

/**
 * The port associated with the listener.
 */
export interface EgressPort {
  /**
   * Label assigned to the port.
   */
  name?: string;
  /**
   * A valid non-negative integer port number.
   */
  number?: number;
  /**
   * The protocol exposed on the port.
   */
  protocol?: string;
  targetPort?: number;
}

/**
 * Settings controlling the volume of connections Envoy will accept from the network.
 */
export interface InboundConnectionPool {
  /**
   * HTTP connection pool settings.
   */
  http?: InboundConnectionPoolHTTP;
  /**
   * Settings common to both HTTP and TCP upstream connections.
   */
  tcp?: InboundConnectionPoolTCP;
}

/**
 * HTTP connection pool settings.
 */
export interface InboundConnectionPoolHTTP {
  /**
   * Specify if http1.1 connection should be upgraded to http2 for the associated
   * destination.
   *
   * Valid Options: DEFAULT, DO_NOT_UPGRADE, UPGRADE
   */
  h2UpgradePolicy?: H2UpgradePolicy;
  /**
   * Maximum number of requests that will be queued while waiting for a ready connection pool
   * connection.
   */
  http1MaxPendingRequests?: number;
  /**
   * Maximum number of active requests to a destination.
   */
  http2MaxRequests?: number;
  /**
   * The idle timeout for upstream connection pool connections.
   */
  idleTimeout?: string;
  /**
   * The maximum number of concurrent streams allowed for a peer on one HTTP/2 connection.
   */
  maxConcurrentStreams?: number;
  /**
   * Maximum number of requests per connection to a backend.
   */
  maxRequestsPerConnection?: number;
  /**
   * Maximum number of retries that can be outstanding to all hosts in a cluster at a given
   * time.
   */
  maxRetries?: number;
  /**
   * If set to true, client protocol will be preserved while initiating connection to backend.
   */
  useClientProtocol?: boolean;
}

/**
 * Specify if http1.1 connection should be upgraded to http2 for the associated
 * destination.
 *
 * Valid Options: DEFAULT, DO_NOT_UPGRADE, UPGRADE
 */
export enum H2UpgradePolicy {
  Default = "DEFAULT",
  DoNotUpgrade = "DO_NOT_UPGRADE",
  Upgrade = "UPGRADE",
}

/**
 * Settings common to both HTTP and TCP upstream connections.
 */
export interface InboundConnectionPoolTCP {
  /**
   * TCP connection timeout.
   */
  connectTimeout?: string;
  /**
   * The idle timeout for TCP connections.
   */
  idleTimeout?: string;
  /**
   * The maximum duration of a connection.
   */
  maxConnectionDuration?: string;
  /**
   * Maximum number of HTTP1 /TCP connections to a destination host.
   */
  maxConnections?: number;
  /**
   * If set then set SO_KEEPALIVE on the socket to enable TCP Keepalives.
   */
  tcpKeepalive?: PurpleTCPKeepalive;
}

/**
 * If set then set SO_KEEPALIVE on the socket to enable TCP Keepalives.
 */
export interface PurpleTCPKeepalive {
  /**
   * The time duration between keep-alive probes.
   */
  interval?: string;
  /**
   * Maximum number of keepalive probes to send without response before deciding the
   * connection is dead.
   */
  probes?: number;
  /**
   * The time duration a connection needs to be idle before keep-alive probes start being sent.
   */
  time?: string;
}

export interface Ingress {
  /**
   * The IP(IPv4 or IPv6) to which the listener should be bound.
   */
  bind?: string;
  /**
   * The captureMode option dictates how traffic to the listener is expected to be captured
   * (or not).
   *
   * Valid Options: DEFAULT, IPTABLES, NONE
   */
  captureMode?: CaptureMode;
  /**
   * Settings controlling the volume of connections Envoy will accept from the network.
   */
  connectionPool?: ConnectionPool;
  /**
   * The IP endpoint or Unix domain socket to which traffic should be forwarded to.
   */
  defaultEndpoint?: string;
  /**
   * The port associated with the listener.
   */
  port: IngressPort;
  /**
   * Set of TLS related options that will enable TLS termination on the sidecar for requests
   * originating from outside the mesh.
   */
  tls?: TLS;
}

/**
 * Settings controlling the volume of connections Envoy will accept from the network.
 */
export interface ConnectionPool {
  /**
   * HTTP connection pool settings.
   */
  http?: ConnectionPoolHTTP;
  /**
   * Settings common to both HTTP and TCP upstream connections.
   */
  tcp?: ConnectionPoolTCP;
}

/**
 * HTTP connection pool settings.
 */
export interface ConnectionPoolHTTP {
  /**
   * Specify if http1.1 connection should be upgraded to http2 for the associated
   * destination.
   *
   * Valid Options: DEFAULT, DO_NOT_UPGRADE, UPGRADE
   */
  h2UpgradePolicy?: H2UpgradePolicy;
  /**
   * Maximum number of requests that will be queued while waiting for a ready connection pool
   * connection.
   */
  http1MaxPendingRequests?: number;
  /**
   * Maximum number of active requests to a destination.
   */
  http2MaxRequests?: number;
  /**
   * The idle timeout for upstream connection pool connections.
   */
  idleTimeout?: string;
  /**
   * The maximum number of concurrent streams allowed for a peer on one HTTP/2 connection.
   */
  maxConcurrentStreams?: number;
  /**
   * Maximum number of requests per connection to a backend.
   */
  maxRequestsPerConnection?: number;
  /**
   * Maximum number of retries that can be outstanding to all hosts in a cluster at a given
   * time.
   */
  maxRetries?: number;
  /**
   * If set to true, client protocol will be preserved while initiating connection to backend.
   */
  useClientProtocol?: boolean;
}

/**
 * Settings common to both HTTP and TCP upstream connections.
 */
export interface ConnectionPoolTCP {
  /**
   * TCP connection timeout.
   */
  connectTimeout?: string;
  /**
   * The idle timeout for TCP connections.
   */
  idleTimeout?: string;
  /**
   * The maximum duration of a connection.
   */
  maxConnectionDuration?: string;
  /**
   * Maximum number of HTTP1 /TCP connections to a destination host.
   */
  maxConnections?: number;
  /**
   * If set then set SO_KEEPALIVE on the socket to enable TCP Keepalives.
   */
  tcpKeepalive?: FluffyTCPKeepalive;
}

/**
 * If set then set SO_KEEPALIVE on the socket to enable TCP Keepalives.
 */
export interface FluffyTCPKeepalive {
  /**
   * The time duration between keep-alive probes.
   */
  interval?: string;
  /**
   * Maximum number of keepalive probes to send without response before deciding the
   * connection is dead.
   */
  probes?: number;
  /**
   * The time duration a connection needs to be idle before keep-alive probes start being sent.
   */
  time?: string;
}

/**
 * The port associated with the listener.
 */
export interface IngressPort {
  /**
   * Label assigned to the port.
   */
  name?: string;
  /**
   * A valid non-negative integer port number.
   */
  number?: number;
  /**
   * The protocol exposed on the port.
   */
  protocol?: string;
  targetPort?: number;
}

/**
 * Set of TLS related options that will enable TLS termination on the sidecar for requests
 * originating from outside the mesh.
 */
export interface TLS {
  /**
   * REQUIRED if mode is `MUTUAL` or `OPTIONAL_MUTUAL`.
   */
  caCertificates?: string;
  /**
   * OPTIONAL: The path to the file containing the certificate revocation list (CRL) to use in
   * verifying a presented client side certificate.
   */
  caCrl?: string;
  /**
   * Optional: If specified, only support the specified cipher list.
   */
  cipherSuites?: string[];
  /**
   * For gateways running on Kubernetes, the name of the secret that holds the TLS certs
   * including the CA certificates.
   */
  credentialName?: string;
  /**
   * If set to true, the load balancer will send a 301 redirect for all http connections,
   * asking the clients to use HTTPS.
   */
  httpsRedirect?: boolean;
  /**
   * Optional: Maximum TLS protocol version.
   *
   * Valid Options: TLS_AUTO, TLSV1_0, TLSV1_1, TLSV1_2, TLSV1_3
   */
  maxProtocolVersion?: ProtocolVersion;
  /**
   * Optional: Minimum TLS protocol version.
   *
   * Valid Options: TLS_AUTO, TLSV1_0, TLSV1_1, TLSV1_2, TLSV1_3
   */
  minProtocolVersion?: ProtocolVersion;
  /**
   * Optional: Indicates whether connections to this port should be secured using TLS.
   *
   * Valid Options: PASSTHROUGH, SIMPLE, MUTUAL, AUTO_PASSTHROUGH, ISTIO_MUTUAL,
   * OPTIONAL_MUTUAL
   */
  mode?: TLSMode;
  /**
   * REQUIRED if mode is `SIMPLE` or `MUTUAL`.
   */
  privateKey?: string;
  /**
   * REQUIRED if mode is `SIMPLE` or `MUTUAL`.
   */
  serverCertificate?: string;
  /**
   * A list of alternate names to verify the subject identity in the certificate presented by
   * the client.
   */
  subjectAltNames?: string[];
  /**
   * An optional list of hex-encoded SHA-256 hashes of the authorized client certificates.
   */
  verifyCertificateHash?: string[];
  /**
   * An optional list of base64-encoded SHA-256 hashes of the SPKIs of authorized client
   * certificates.
   */
  verifyCertificateSpki?: string[];
}

/**
 * Optional: Maximum TLS protocol version.
 *
 * Valid Options: TLS_AUTO, TLSV1_0, TLSV1_1, TLSV1_2, TLSV1_3
 *
 * Optional: Minimum TLS protocol version.
 *
 * Valid Options: TLS_AUTO, TLSV1_0, TLSV1_1, TLSV1_2, TLSV1_3
 */
export enum ProtocolVersion {
  TLSAuto = "TLS_AUTO",
  Tlsv10 = "TLSV1_0",
  Tlsv11 = "TLSV1_1",
  Tlsv12 = "TLSV1_2",
  Tlsv13 = "TLSV1_3",
}

/**
 * Optional: Indicates whether connections to this port should be secured using TLS.
 *
 * Valid Options: PASSTHROUGH, SIMPLE, MUTUAL, AUTO_PASSTHROUGH, ISTIO_MUTUAL,
 * OPTIONAL_MUTUAL
 */
export enum TLSMode {
  AutoPassthrough = "AUTO_PASSTHROUGH",
  IstioMutual = "ISTIO_MUTUAL",
  Mutual = "MUTUAL",
  OptionalMutual = "OPTIONAL_MUTUAL",
  Passthrough = "PASSTHROUGH",
  Simple = "SIMPLE",
}

/**
 * Set the default behavior of the sidecar for handling outbound traffic from the
 * application.
 */
export interface OutboundTrafficPolicy {
  egressProxy?: EgressProxy;
  /**
   * Valid Options: REGISTRY_ONLY, ALLOW_ANY
   */
  mode?: OutboundTrafficPolicyMode;
}

export interface EgressProxy {
  /**
   * The name of a service from the service registry.
   */
  host: string;
  /**
   * Specifies the port on the host that is being addressed.
   */
  port?: EgressProxyPort;
  /**
   * The name of a subset within the service.
   */
  subset?: string;
}

/**
 * Specifies the port on the host that is being addressed.
 */
export interface EgressProxyPort {
  number?: number;
}

/**
 * Valid Options: REGISTRY_ONLY, ALLOW_ANY
 */
export enum OutboundTrafficPolicyMode {
  AllowAny = "ALLOW_ANY",
  RegistryOnly = "REGISTRY_ONLY",
}

/**
 * Criteria used to select the specific set of pods/VMs on which this `Sidecar`
 * configuration should be applied.
 */
export interface WorkloadSelector {
  /**
   * One or more labels that indicate a specific set of pods/VMs on which the configuration
   * should be applied.
   */
  labels?: { [key: string]: string };
}

export interface Status {
  /**
   * Current service state of the resource.
   */
  conditions?: Condition[];
  /**
   * Resource Generation to which the Reconciled Condition refers.
   */
  observedGeneration?: number | string;
  /**
   * Includes any errors or warnings detected by Istio's analyzers.
   */
  validationMessages?: ValidationMessage[];
}

export interface Condition {
  /**
   * Last time we probed the condition.
   */
  lastProbeTime?: Date;
  /**
   * Last time the condition transitioned from one status to another.
   */
  lastTransitionTime?: Date;
  /**
   * Human-readable message indicating details about last transition.
   */
  message?: string;
  /**
   * Unique, one-word, CamelCase reason for the condition's last transition.
   */
  reason?: string;
  /**
   * Status is the status of the condition.
   */
  status?: string;
  /**
   * Type is the type of the condition.
   */
  type?: string;
}

export interface ValidationMessage {
  /**
   * A url pointing to the Istio documentation for this specific error type.
   */
  documentationUrl?: string;
  /**
   * Represents how severe a message is.
   *
   * Valid Options: UNKNOWN, ERROR, WARNING, INFO
   */
  level?: Level;
  type?: Type;
}

/**
 * Represents how severe a message is.
 *
 * Valid Options: UNKNOWN, ERROR, WARNING, INFO
 */
export enum Level {
  Error = "ERROR",
  Info = "INFO",
  Unknown = "UNKNOWN",
  Warning = "WARNING",
}

export interface Type {
  /**
   * A 7 character code matching `^IST[0-9]{4}$` intended to uniquely identify the message
   * type.
   */
  code?: string;
  /**
   * A human-readable name for the message type.
   */
  name?: string;
}

RegisterKind(Sidecar, {
  group: "networking.istio.io",
  version: "v1",
  kind: "Sidecar",
  plural: "sidecars",
});
