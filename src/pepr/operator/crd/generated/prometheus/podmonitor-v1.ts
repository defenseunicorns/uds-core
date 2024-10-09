// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
// This file is auto-generated by kubernetes-fluent-client, do not edit manually

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

/**
 * The `PodMonitor` custom resource definition (CRD) defines how `Prometheus` and
 * `PrometheusAgent` can scrape metrics from a group of pods.
 * Among other things, it allows to specify:
 * * The pods to scrape via label selectors.
 * * The container ports to scrape.
 * * Authentication credentials to use.
 * * Target and metric relabeling.
 *
 *
 * `Prometheus` and `PrometheusAgent` objects select `PodMonitor` objects using label and
 * namespace selectors.
 */
export class PodMonitor extends GenericKind {
  /**
   * Specification of desired Pod selection for target discovery by Prometheus.
   */
  spec?: Spec;
}

/**
 * Specification of desired Pod selection for target discovery by Prometheus.
 */
export interface Spec {
  /**
   * `attachMetadata` defines additional metadata which is added to the
   * discovered targets.
   *
   *
   * It requires Prometheus >= v2.35.0.
   */
  attachMetadata?: AttachMetadata;
  /**
   * When defined, bodySizeLimit specifies a job level limit on the size
   * of uncompressed response body that will be accepted by Prometheus.
   *
   *
   * It requires Prometheus >= v2.28.0.
   */
  bodySizeLimit?: string;
  /**
   * The label to use to retrieve the job name from.
   * `jobLabel` selects the label from the associated Kubernetes `Pod`
   * object which will be used as the `job` label for all metrics.
   *
   *
   * For example if `jobLabel` is set to `foo` and the Kubernetes `Pod`
   * object is labeled with `foo: bar`, then Prometheus adds the `job="bar"`
   * label to all ingested metrics.
   *
   *
   * If the value of this field is empty, the `job` label of the metrics
   * defaults to the namespace and name of the PodMonitor object (e.g. `<namespace>/<name>`).
   */
  jobLabel?: string;
  /**
   * Per-scrape limit on the number of targets dropped by relabeling
   * that will be kept in memory. 0 means no limit.
   *
   *
   * It requires Prometheus >= v2.47.0.
   */
  keepDroppedTargets?: number;
  /**
   * Per-scrape limit on number of labels that will be accepted for a sample.
   *
   *
   * It requires Prometheus >= v2.27.0.
   */
  labelLimit?: number;
  /**
   * Per-scrape limit on length of labels name that will be accepted for a sample.
   *
   *
   * It requires Prometheus >= v2.27.0.
   */
  labelNameLengthLimit?: number;
  /**
   * Per-scrape limit on length of labels value that will be accepted for a sample.
   *
   *
   * It requires Prometheus >= v2.27.0.
   */
  labelValueLengthLimit?: number;
  /**
   * `namespaceSelector` defines in which namespace(s) Prometheus should discover the pods.
   * By default, the pods are discovered in the same namespace as the `PodMonitor` object but
   * it is possible to select pods across different/all namespaces.
   */
  namespaceSelector?: NamespaceSelector;
  /**
   * Defines how to scrape metrics from the selected pods.
   */
  podMetricsEndpoints?: PodMetricsEndpoint[];
  /**
   * `podTargetLabels` defines the labels which are transferred from the
   * associated Kubernetes `Pod` object onto the ingested metrics.
   */
  podTargetLabels?: string[];
  /**
   * `sampleLimit` defines a per-scrape limit on the number of scraped samples
   * that will be accepted.
   */
  sampleLimit?: number;
  /**
   * The scrape class to apply.
   */
  scrapeClass?: string;
  /**
   * `scrapeProtocols` defines the protocols to negotiate during a scrape. It tells clients
   * the
   * protocols supported by Prometheus in order of preference (from most to least
   * preferred).
   *
   *
   * If unset, Prometheus uses its default value.
   *
   *
   * It requires Prometheus >= v2.49.0.
   */
  scrapeProtocols?: ScrapeProtocol[];
  /**
   * Label selector to select the Kubernetes `Pod` objects to scrape metrics from.
   */
  selector: Selector;
  /**
   * `targetLimit` defines a limit on the number of scraped targets that will
   * be accepted.
   */
  targetLimit?: number;
}

/**
 * `attachMetadata` defines additional metadata which is added to the
 * discovered targets.
 *
 *
 * It requires Prometheus >= v2.35.0.
 */
export interface AttachMetadata {
  /**
   * When set to true, Prometheus attaches node metadata to the discovered
   * targets.
   *
   *
   * The Prometheus service account must have the `list` and `watch`
   * permissions on the `Nodes` objects.
   */
  node?: boolean;
}

/**
 * `namespaceSelector` defines in which namespace(s) Prometheus should discover the pods.
 * By default, the pods are discovered in the same namespace as the `PodMonitor` object but
 * it is possible to select pods across different/all namespaces.
 */
export interface NamespaceSelector {
  /**
   * Boolean describing whether all namespaces are selected in contrast to a
   * list restricting them.
   */
  any?: boolean;
  /**
   * List of namespace names to select from.
   */
  matchNames?: string[];
}

/**
 * PodMetricsEndpoint defines an endpoint serving Prometheus metrics to be scraped by
 * Prometheus.
 */
export interface PodMetricsEndpoint {
  /**
   * `authorization` configures the Authorization header credentials to use when
   * scraping the target.
   *
   *
   * Cannot be set at the same time as `basicAuth`, or `oauth2`.
   */
  authorization?: Authorization;
  /**
   * `basicAuth` configures the Basic Authentication credentials to use when
   * scraping the target.
   *
   *
   * Cannot be set at the same time as `authorization`, or `oauth2`.
   */
  basicAuth?: BasicAuth;
  /**
   * `bearerTokenSecret` specifies a key of a Secret containing the bearer
   * token for scraping targets. The secret needs to be in the same namespace
   * as the PodMonitor object and readable by the Prometheus Operator.
   *
   *
   * Deprecated: use `authorization` instead.
   */
  bearerTokenSecret?: BearerTokenSecret;
  /**
   * `enableHttp2` can be used to disable HTTP2 when scraping the target.
   */
  enableHttp2?: boolean;
  /**
   * When true, the pods which are not running (e.g. either in Failed or
   * Succeeded state) are dropped during the target discovery.
   *
   *
   * If unset, the filtering is enabled.
   *
   *
   * More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-phase
   */
  filterRunning?: boolean;
  /**
   * `followRedirects` defines whether the scrape requests should follow HTTP
   * 3xx redirects.
   */
  followRedirects?: boolean;
  /**
   * When true, `honorLabels` preserves the metric's labels when they collide
   * with the target's labels.
   */
  honorLabels?: boolean;
  /**
   * `honorTimestamps` controls whether Prometheus preserves the timestamps
   * when exposed by the target.
   */
  honorTimestamps?: boolean;
  /**
   * Interval at which Prometheus scrapes the metrics from the target.
   *
   *
   * If empty, Prometheus uses the global scrape interval.
   */
  interval?: string;
  /**
   * `metricRelabelings` configures the relabeling rules to apply to the
   * samples before ingestion.
   */
  metricRelabelings?: MetricRelabeling[];
  /**
   * `oauth2` configures the OAuth2 settings to use when scraping the target.
   *
   *
   * It requires Prometheus >= 2.27.0.
   *
   *
   * Cannot be set at the same time as `authorization`, or `basicAuth`.
   */
  oauth2?: Oauth2;
  /**
   * `params` define optional HTTP URL parameters.
   */
  params?: { [key: string]: string[] };
  /**
   * HTTP path from which to scrape for metrics.
   *
   *
   * If empty, Prometheus uses the default value (e.g. `/metrics`).
   */
  path?: string;
  /**
   * Name of the Pod port which this endpoint refers to.
   *
   *
   * It takes precedence over `targetPort`.
   */
  port?: string;
  /**
   * `proxyURL` configures the HTTP Proxy URL (e.g.
   * "http://proxyserver:2195") to go through when scraping the target.
   */
  proxyUrl?: string;
  /**
   * `relabelings` configures the relabeling rules to apply the target's
   * metadata labels.
   *
   *
   * The Operator automatically adds relabelings for a few standard Kubernetes fields.
   *
   *
   * The original scrape job's name is available via the `__tmp_prometheus_job_name` label.
   *
   *
   * More info:
   * https://prometheus.io/docs/prometheus/latest/configuration/configuration/#relabel_config
   */
  relabelings?: Relabeling[];
  /**
   * HTTP scheme to use for scraping.
   *
   *
   * `http` and `https` are the expected values unless you rewrite the
   * `__scheme__` label via relabeling.
   *
   *
   * If empty, Prometheus uses the default value `http`.
   */
  scheme?: Scheme;
  /**
   * Timeout after which Prometheus considers the scrape to be failed.
   *
   *
   * If empty, Prometheus uses the global scrape timeout unless it is less
   * than the target's scrape interval value in which the latter is used.
   */
  scrapeTimeout?: string;
  /**
   * Name or number of the target port of the `Pod` object behind the Service, the
   * port must be specified with container port property.
   *
   *
   * Deprecated: use 'port' instead.
   */
  targetPort?: number | string;
  /**
   * TLS configuration to use when scraping the target.
   */
  tlsConfig?: PodMetricsEndpointTLSConfig;
  /**
   * `trackTimestampsStaleness` defines whether Prometheus tracks staleness of
   * the metrics that have an explicit timestamp present in scraped data.
   * Has no effect if `honorTimestamps` is false.
   *
   *
   * It requires Prometheus >= v2.48.0.
   */
  trackTimestampsStaleness?: boolean;
}

/**
 * `authorization` configures the Authorization header credentials to use when
 * scraping the target.
 *
 *
 * Cannot be set at the same time as `basicAuth`, or `oauth2`.
 */
export interface Authorization {
  /**
   * Selects a key of a Secret in the namespace that contains the credentials for
   * authentication.
   */
  credentials?: Credentials;
  /**
   * Defines the authentication type. The value is case-insensitive.
   *
   *
   * "Basic" is not a supported value.
   *
   *
   * Default: "Bearer"
   */
  type?: string;
}

/**
 * Selects a key of a Secret in the namespace that contains the credentials for
 * authentication.
 */
export interface Credentials {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * `basicAuth` configures the Basic Authentication credentials to use when
 * scraping the target.
 *
 *
 * Cannot be set at the same time as `authorization`, or `oauth2`.
 */
export interface BasicAuth {
  /**
   * `password` specifies a key of a Secret containing the password for
   * authentication.
   */
  password?: Password;
  /**
   * `username` specifies a key of a Secret containing the username for
   * authentication.
   */
  username?: Username;
}

/**
 * `password` specifies a key of a Secret containing the password for
 * authentication.
 */
export interface Password {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * `username` specifies a key of a Secret containing the username for
 * authentication.
 */
export interface Username {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * `bearerTokenSecret` specifies a key of a Secret containing the bearer
 * token for scraping targets. The secret needs to be in the same namespace
 * as the PodMonitor object and readable by the Prometheus Operator.
 *
 *
 * Deprecated: use `authorization` instead.
 */
export interface BearerTokenSecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * RelabelConfig allows dynamic rewriting of the label set for targets, alerts,
 * scraped samples and remote write samples.
 *
 *
 * More info:
 * https://prometheus.io/docs/prometheus/latest/configuration/configuration/#relabel_config
 */
export interface MetricRelabeling {
  /**
   * Action to perform based on the regex matching.
   *
   *
   * `Uppercase` and `Lowercase` actions require Prometheus >= v2.36.0.
   * `DropEqual` and `KeepEqual` actions require Prometheus >= v2.41.0.
   *
   *
   * Default: "Replace"
   */
  action?: Action;
  /**
   * Modulus to take of the hash of the source label values.
   *
   *
   * Only applicable when the action is `HashMod`.
   */
  modulus?: number;
  /**
   * Regular expression against which the extracted value is matched.
   */
  regex?: string;
  /**
   * Replacement value against which a Replace action is performed if the
   * regular expression matches.
   *
   *
   * Regex capture groups are available.
   */
  replacement?: string;
  /**
   * Separator is the string between concatenated SourceLabels.
   */
  separator?: string;
  /**
   * The source labels select values from existing labels. Their content is
   * concatenated using the configured Separator and matched against the
   * configured regular expression.
   */
  sourceLabels?: string[];
  /**
   * Label to which the resulting string is written in a replacement.
   *
   *
   * It is mandatory for `Replace`, `HashMod`, `Lowercase`, `Uppercase`,
   * `KeepEqual` and `DropEqual` actions.
   *
   *
   * Regex capture groups are available.
   */
  targetLabel?: string;
}

/**
 * Action to perform based on the regex matching.
 *
 *
 * `Uppercase` and `Lowercase` actions require Prometheus >= v2.36.0.
 * `DropEqual` and `KeepEqual` actions require Prometheus >= v2.41.0.
 *
 *
 * Default: "Replace"
 */
export enum Action {
  ActionDrop = "Drop",
  ActionKeep = "Keep",
  ActionLowercase = "Lowercase",
  ActionReplace = "Replace",
  ActionUppercase = "Uppercase",
  Drop = "drop",
  DropEqual = "DropEqual",
  Dropequal = "dropequal",
  HashMod = "HashMod",
  Hashmod = "hashmod",
  Keep = "keep",
  KeepEqual = "KeepEqual",
  Keepequal = "keepequal",
  LabelDrop = "LabelDrop",
  LabelKeep = "LabelKeep",
  LabelMap = "LabelMap",
  Labeldrop = "labeldrop",
  Labelkeep = "labelkeep",
  Labelmap = "labelmap",
  Lowercase = "lowercase",
  Replace = "replace",
  Uppercase = "uppercase",
}

/**
 * `oauth2` configures the OAuth2 settings to use when scraping the target.
 *
 *
 * It requires Prometheus >= 2.27.0.
 *
 *
 * Cannot be set at the same time as `authorization`, or `basicAuth`.
 */
export interface Oauth2 {
  /**
   * `clientId` specifies a key of a Secret or ConfigMap containing the
   * OAuth2 client's ID.
   */
  clientId: ClientID;
  /**
   * `clientSecret` specifies a key of a Secret containing the OAuth2
   * client's secret.
   */
  clientSecret: ClientSecret;
  /**
   * `endpointParams` configures the HTTP parameters to append to the token
   * URL.
   */
  endpointParams?: { [key: string]: string };
  /**
   * `noProxy` is a comma-separated string that can contain IPs, CIDR notation, domain names
   * that should be excluded from proxying. IP and domain names can
   * contain port numbers.
   *
   *
   * It requires Prometheus >= v2.43.0.
   */
  noProxy?: string;
  /**
   * ProxyConnectHeader optionally specifies headers to send to
   * proxies during CONNECT requests.
   *
   *
   * It requires Prometheus >= v2.43.0.
   */
  proxyConnectHeader?: { [key: string]: ProxyConnectHeader[] };
  /**
   * Whether to use the proxy configuration defined by environment variables (HTTP_PROXY,
   * HTTPS_PROXY, and NO_PROXY).
   * If unset, Prometheus uses its default value.
   *
   *
   * It requires Prometheus >= v2.43.0.
   */
  proxyFromEnvironment?: boolean;
  /**
   * `proxyURL` defines the HTTP proxy server to use.
   *
   *
   * It requires Prometheus >= v2.43.0.
   */
  proxyUrl?: string;
  /**
   * `scopes` defines the OAuth2 scopes used for the token request.
   */
  scopes?: string[];
  /**
   * TLS configuration to use when connecting to the OAuth2 server.
   * It requires Prometheus >= v2.43.0.
   */
  tlsConfig?: Oauth2TLSConfig;
  /**
   * `tokenURL` configures the URL to fetch the token from.
   */
  tokenUrl: string;
}

/**
 * `clientId` specifies a key of a Secret or ConfigMap containing the
 * OAuth2 client's ID.
 */
export interface ClientID {
  /**
   * ConfigMap containing data to use for the targets.
   */
  configMap?: ClientIDConfigMap;
  /**
   * Secret containing data to use for the targets.
   */
  secret?: ClientIDSecret;
}

/**
 * ConfigMap containing data to use for the targets.
 */
export interface ClientIDConfigMap {
  /**
   * The key to select.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the ConfigMap or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing data to use for the targets.
 */
export interface ClientIDSecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * `clientSecret` specifies a key of a Secret containing the OAuth2
 * client's secret.
 */
export interface ClientSecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * SecretKeySelector selects a key of a Secret.
 */
export interface ProxyConnectHeader {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * TLS configuration to use when connecting to the OAuth2 server.
 * It requires Prometheus >= v2.43.0.
 */
export interface Oauth2TLSConfig {
  /**
   * Certificate authority used when verifying server certificates.
   */
  ca?: PurpleCA;
  /**
   * Client certificate to present when doing client-authentication.
   */
  cert?: PurpleCERT;
  /**
   * Disable target certificate validation.
   */
  insecureSkipVerify?: boolean;
  /**
   * Secret containing the client key file for the targets.
   */
  keySecret?: PurpleKeySecret;
  /**
   * Maximum acceptable TLS version.
   *
   *
   * It requires Prometheus >= v2.41.0.
   */
  maxVersion?: Version;
  /**
   * Minimum acceptable TLS version.
   *
   *
   * It requires Prometheus >= v2.35.0.
   */
  minVersion?: Version;
  /**
   * Used to verify the hostname for the targets.
   */
  serverName?: string;
}

/**
 * Certificate authority used when verifying server certificates.
 */
export interface PurpleCA {
  /**
   * ConfigMap containing data to use for the targets.
   */
  configMap?: PurpleConfigMap;
  /**
   * Secret containing data to use for the targets.
   */
  secret?: PurpleSecret;
}

/**
 * ConfigMap containing data to use for the targets.
 */
export interface PurpleConfigMap {
  /**
   * The key to select.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the ConfigMap or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing data to use for the targets.
 */
export interface PurpleSecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * Client certificate to present when doing client-authentication.
 */
export interface PurpleCERT {
  /**
   * ConfigMap containing data to use for the targets.
   */
  configMap?: FluffyConfigMap;
  /**
   * Secret containing data to use for the targets.
   */
  secret?: FluffySecret;
}

/**
 * ConfigMap containing data to use for the targets.
 */
export interface FluffyConfigMap {
  /**
   * The key to select.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the ConfigMap or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing data to use for the targets.
 */
export interface FluffySecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing the client key file for the targets.
 */
export interface PurpleKeySecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * Maximum acceptable TLS version.
 *
 *
 * It requires Prometheus >= v2.41.0.
 *
 * Minimum acceptable TLS version.
 *
 *
 * It requires Prometheus >= v2.35.0.
 */
export enum Version {
  Tls10 = "TLS10",
  Tls11 = "TLS11",
  Tls12 = "TLS12",
  Tls13 = "TLS13",
}

/**
 * RelabelConfig allows dynamic rewriting of the label set for targets, alerts,
 * scraped samples and remote write samples.
 *
 *
 * More info:
 * https://prometheus.io/docs/prometheus/latest/configuration/configuration/#relabel_config
 */
export interface Relabeling {
  /**
   * Action to perform based on the regex matching.
   *
   *
   * `Uppercase` and `Lowercase` actions require Prometheus >= v2.36.0.
   * `DropEqual` and `KeepEqual` actions require Prometheus >= v2.41.0.
   *
   *
   * Default: "Replace"
   */
  action?: Action;
  /**
   * Modulus to take of the hash of the source label values.
   *
   *
   * Only applicable when the action is `HashMod`.
   */
  modulus?: number;
  /**
   * Regular expression against which the extracted value is matched.
   */
  regex?: string;
  /**
   * Replacement value against which a Replace action is performed if the
   * regular expression matches.
   *
   *
   * Regex capture groups are available.
   */
  replacement?: string;
  /**
   * Separator is the string between concatenated SourceLabels.
   */
  separator?: string;
  /**
   * The source labels select values from existing labels. Their content is
   * concatenated using the configured Separator and matched against the
   * configured regular expression.
   */
  sourceLabels?: string[];
  /**
   * Label to which the resulting string is written in a replacement.
   *
   *
   * It is mandatory for `Replace`, `HashMod`, `Lowercase`, `Uppercase`,
   * `KeepEqual` and `DropEqual` actions.
   *
   *
   * Regex capture groups are available.
   */
  targetLabel?: string;
}

/**
 * HTTP scheme to use for scraping.
 *
 *
 * `http` and `https` are the expected values unless you rewrite the
 * `__scheme__` label via relabeling.
 *
 *
 * If empty, Prometheus uses the default value `http`.
 */
export enum Scheme {
  HTTP = "http",
  HTTPS = "https",
}

/**
 * TLS configuration to use when scraping the target.
 */
export interface PodMetricsEndpointTLSConfig {
  /**
   * Certificate authority used when verifying server certificates.
   */
  ca?: FluffyCA;
  /**
   * Client certificate to present when doing client-authentication.
   */
  cert?: FluffyCERT;
  /**
   * Disable target certificate validation.
   */
  insecureSkipVerify?: boolean;
  /**
   * Secret containing the client key file for the targets.
   */
  keySecret?: FluffyKeySecret;
  /**
   * Maximum acceptable TLS version.
   *
   *
   * It requires Prometheus >= v2.41.0.
   */
  maxVersion?: Version;
  /**
   * Minimum acceptable TLS version.
   *
   *
   * It requires Prometheus >= v2.35.0.
   */
  minVersion?: Version;
  /**
   * Used to verify the hostname for the targets.
   */
  serverName?: string;
}

/**
 * Certificate authority used when verifying server certificates.
 */
export interface FluffyCA {
  /**
   * ConfigMap containing data to use for the targets.
   */
  configMap?: TentacledConfigMap;
  /**
   * Secret containing data to use for the targets.
   */
  secret?: TentacledSecret;
}

/**
 * ConfigMap containing data to use for the targets.
 */
export interface TentacledConfigMap {
  /**
   * The key to select.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the ConfigMap or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing data to use for the targets.
 */
export interface TentacledSecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * Client certificate to present when doing client-authentication.
 */
export interface FluffyCERT {
  /**
   * ConfigMap containing data to use for the targets.
   */
  configMap?: StickyConfigMap;
  /**
   * Secret containing data to use for the targets.
   */
  secret?: StickySecret;
}

/**
 * ConfigMap containing data to use for the targets.
 */
export interface StickyConfigMap {
  /**
   * The key to select.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the ConfigMap or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing data to use for the targets.
 */
export interface StickySecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * Secret containing the client key file for the targets.
 */
export interface FluffyKeySecret {
  /**
   * The key of the secret to select from.  Must be a valid secret key.
   */
  key: string;
  /**
   * Name of the referent.
   * This field is effectively required, but due to backwards compatibility is
   * allowed to be empty. Instances of this type with an empty value here are
   * almost certainly wrong.
   * TODO: Add other useful fields. apiVersion, kind, uid?
   * More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names
   * TODO: Drop `kubebuilder:default` when controller-gen doesn't need it
   * https://github.com/kubernetes-sigs/kubebuilder/issues/3896.
   */
  name?: string;
  /**
   * Specify whether the Secret or its key must be defined
   */
  optional?: boolean;
}

/**
 * ScrapeProtocol represents a protocol used by Prometheus for scraping metrics.
 * Supported values are:
 * * `OpenMetricsText0.0.1`
 * * `OpenMetricsText1.0.0`
 * * `PrometheusProto`
 * * `PrometheusText0.0.4`
 */
export enum ScrapeProtocol {
  OpenMetricsText001 = "OpenMetricsText0.0.1",
  OpenMetricsText100 = "OpenMetricsText1.0.0",
  PrometheusProto = "PrometheusProto",
  PrometheusText004 = "PrometheusText0.0.4",
}

/**
 * Label selector to select the Kubernetes `Pod` objects to scrape metrics from.
 */
export interface Selector {
  /**
   * matchExpressions is a list of label selector requirements. The requirements are ANDed.
   */
  matchExpressions?: MatchExpression[];
  /**
   * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels
   * map is equivalent to an element of matchExpressions, whose key field is "key", the
   * operator is "In", and the values array contains only "value". The requirements are ANDed.
   */
  matchLabels?: { [key: string]: string };
}

/**
 * A label selector requirement is a selector that contains values, a key, and an operator
 * that
 * relates the key and values.
 */
export interface MatchExpression {
  /**
   * key is the label key that the selector applies to.
   */
  key: string;
  /**
   * operator represents a key's relationship to a set of values.
   * Valid operators are In, NotIn, Exists and DoesNotExist.
   */
  operator: string;
  /**
   * values is an array of string values. If the operator is In or NotIn,
   * the values array must be non-empty. If the operator is Exists or DoesNotExist,
   * the values array must be empty. This array is replaced during a strategic
   * merge patch.
   */
  values?: string[];
}

RegisterKind(PodMonitor, {
  group: "monitoring.coreos.com",
  version: "v1",
  kind: "PodMonitor",
  plural: "podmonitors",
});
