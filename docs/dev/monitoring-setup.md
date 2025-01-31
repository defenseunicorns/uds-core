# UDS Core Metrics Scraping Setup

UDS Core leverages Pepr to handle setup of Prometheus scraping metrics endpoints, with the particular configuration necessary to work in a STRICT mTLS (Istio) environment. We handle this via a default scrapeClass in prometheus to add the istio certs. When a monitor needs to be exempt from that tlsConfig a mutation is performed to leverage a plain scrape class without istio certs.

> [!NOTE]  
> The setup described below is the current setup that was designed to handle complexities of Istio sidecars with metrics. With ongoing work to move to Istio ambient this setup should be significantly simplified.

## TLS Configuration Setup

Generally it is beneficial to use service and pod monitor resources from existing helm charts where possible as these may have more advanced configuration and options. The UDS monitoring setup ensures that all monitoring resources use a default [`scrapeClass`](https://github.com/prometheus-operator/prometheus-operator/blob/v0.75.1/Documentation/api.md#monitoring.coreos.com/v1.ScrapeClass) configured in Prometheus to handle the necessary `tlsConfig` setup for metrics to work in STRICT Istio mTLS environments (the `scheme` is also mutated to `https` on individual monitor endpoints, see [this doc](https://istio.io/latest/docs/ops/integrations/prometheus/#tls-settings) for details). This setup is the default configuration but individual monitors can opt out of this config in 3 different ways:

1. If the service or pod monitor targets namespaces that are not Istio injected (ex: `kube-system`), Pepr will detect this and mutate these monitors to use an `exempt` scrape class that does not have the Istio certs. Assumptions are made about STRICT mTLS here for simplicity, based on the `istio-injection` namespace label. Without making these assumptions we would need to query `PeerAuthentication` resources or another resource to determine the exact workload mTLS posture.
1. Individual monitors can explicitly set the `exempt` scrape class to opt out of the Istio certificate configuration. This should typically only be done if your service exposes metrics on a PERMISSIVE mTLS port.
1. If setting a `scrapeClass` is not an option due to lack of configuration in a helm chart, or for other reasons, monitors can use the `uds/skip-mutate` annotation (with any value) to have Pepr mutate the `exempt` scrape class onto the monitor.

> [!NOTE]  
> There is a deprecated functionality in Pepr that will mutate `tlsConfig` onto individual service monitors, rather than using the scrape class approach. This has been kept in the current code temporarily to prevent any metrics downtime during the switch to `scrapeClass`. In a future release this behavior will be removed to reduce the complexity of the setup and required mutations.

## Notes on Alternative Approaches

In coming up with this feature when targeting the `ServiceMonitor` use case a few alternative approaches were considered but not chosen due to issues with each one. The current spec provides the best balance of a simplified interface compared to the `ServiceMonitor` spec, and a faster/easier reconciliation loop.

### Generation based on service lookup

An alternative spec option would use the service name instead of selectors/port name. The service name could then be used to lookup the corresponding service and get the necessary selectors/port name (based on numerical port). There are however 2 issues with this route:

1. There is a timing issue if the `Package` CR is applied to the cluster before the app chart itself (which is the norm with our UDS Packages). The service would not exist at the time the `Package` is reconciled. We could lean into eventual consistency here, if we implemented a retry mechanism for the `Package`, which would mitigate this issue.
2. We would need an "alert" mechanism (watch) to notify us when the service(s) are updated, to roll the corresponding updates to network policies and service monitors. While this is doable it feels like unnecessary complexity compared to other options.

### Generation of service + monitor

Another alternative approach would be to use a pod selector and port only. We would then generate both a service and servicemonitor, giving us full control of the port names and selectors. This seems like a viable path, but does add an extra resource for us to generate and manage. There could be unknown side effects of generating services that could clash with other services (particularly with istio endpoints). This would otherwise be a relative straightforward approach and is worth evaluating again if we want to simplify the spec later on.
