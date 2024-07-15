---
title: Monitoring and Metrics
type: docs
weight: 1
---

UDS Core leverages Pepr to handle setup of Prometheus scraping metrics endpoints, with the particular configuration necessary to work in a STRICT mTLS (Istio) environment. We handle this via a default scrapeClass in prometheus to add the istio certs. When a monitor needs to be exempt from that tlsConfig a mutation is performed to leverage a plain scrape class without istio certs.

## TLS Configuration Setup

Generally it is beneficial to use service and pod monitor resources from existing helm charts where possible as these may have more advanced configuration and options. The UDS monitoring setup ensures that all monitoring resources use a default [`scrapeClass`](https://github.com/prometheus-operator/prometheus-operator/blob/v0.75.1/Documentation/api.md#monitoring.coreos.com/v1.ScrapeClass) configured in Prometheus to handle the necessary `tlsConfig` setup for metrics to work in STRICT Istio mTLS environments (the `scheme` is also mutated to `https` on individual monitor endpoints, see [this doc](https://istio.io/latest/docs/ops/integrations/prometheus/#tls-settings) for details). This setup is the default configuration but individual monitors can opt out of this config in 3 different ways:

1. If the service or pod monitor targets namespaces that are not Istio injected (ex: `kube-system`), Pepr will detect this and mutate these monitors to use an `exempt` scrape class that does not have the Istio certs. Assumptions are made about STRICT mTLS here for simplicity, based on the `istio-injection` namespace label. Without making these assumptions we would need to query `PeerAuthentication` resources or another resource to determine the exact workload mTLS posture.
1. Individual monitors can explicitly set the `exempt` scrape class to opt out of the Istio certificate configuration. This should typically only be done if your service exposes metrics on a PERMISSIVE mTLS port.
1. If setting a `scrapeClass` is not an option due to lack of configuration in a helm chart, or for other reasons, monitors can use the `uds/skip-mutate` annotation (with any value) to have Pepr mutate the `exempt` scrape class onto the monitor.

{{% alert-note %}}
There is a deprecated functionality in Pepr that will mutate `tlsConfig` onto individual service monitors, rather than using the scrape class approach. This has been kept in the current code temporarily to prevent any metrics downtime during the switch to `scrapeClass`. In a future release this behavior will be removed to reduce the complexity of the setup and required mutations.
{{% /alert-note %}}

## Package CR `monitor` field

UDS Core also supports generating `ServiceMonitors` and/or `PodMonitors` from the `monitor` list in the `Package` spec. Charts do not always support monitors, so generating them can be useful. This also provides a simplified way for other users to create monitors, similar to the way we handle `VirtualServices` today. A full example of this can be seen below:

```yaml
...
spec:
  monitor:
    # Example Service Monitor
    - selector: # Selector for the service to monitor
        app: foobar
      portName: metrics # Name of the port to monitor
      targetPort: 1234 # Corresponding target port on the pod/container (for network policy)
      # Optional properties depending on your application
      description: "Metrics" # Add to customize the service monitor name
      kind: ServiceMonitor # optional, kind defaults to service monitor if not specified. PodMonitor is the other valid option.
      podSelector: # Add if pod labels are different than `selector` (for network policy)
        app: barfoo
      path: "/mymetrics" # Add if metrics are exposed on a different path than "/metrics"
      authorization: # Add if authorization is required for the metrics endpoint
        credentials:
          key: "example-key"
          name: "example-secret"
          optional: false
        type: "Bearer"
    # Example Pod Monitor
    - portName: metrics # Name of the port on the pod to monitor
      targetPort: 1234 # Corresponding target port on the pod/container (for network policy)
      selector: # Selector for pod(s) to monitor; note: pod monitors support `podSelector` as well, both options behave the same
        app: barfoo
      kind: PodMonitor
      # Optional properties depending on your application
      description: "Metrics" # Add to customize the pod monitor name
      path: "/mymetrics" # Add if metrics are exposed on a different path than "/metrics"
      authorization: # Add if authorization is required for the metrics endpoint
        credentials:
          key: "example-key"
          name: "example-secret"
          optional: false
        type: "Bearer"
```

This config is used to generate service or pod monitors and corresponding network policies to setup scraping for your applications. The aforementioned TLS configuration will also apply to these generated monitors, setting a default scrape class unless target namespaces are non-istio-injected.

This spec intentionally does not support all options available with a `PodMonitor` or `ServiceMonitor`. While we may add additional fields in the future, we do not want to simply rebuild these specs since we are handling the complexities of Istio mTLS metrics. The current subset of spec options is based on the common needs seen in most environments.

## Notes on Alternative Approaches

In coming up with this feature when targeting the `ServiceMonitor` use case a few alternative approaches were considered but not chosen due to issues with each one. The current spec provides the best balance of a simplified interface compared to the `ServiceMonitor` spec, and a faster/easier reconciliation loop.

### Generation based on service lookup

An alternative spec option would use the service name instead of selectors/port name. The service name could then be used to lookup the corresponding service and get the necessary selectors/port name (based on numerical port). There are however 2 issues with this route:

1. There is a timing issue if the `Package` CR is applied to the cluster before the app chart itself (which is the norm with our UDS Packages). The service would not exist at the time the `Package` is reconciled. We could lean into eventual consistency here, if we implemented a retry mechanism for the `Package`, which would mitigate this issue.
2. We would need an "alert" mechanism (watch) to notify us when the service(s) are updated, to roll the corresponding updates to network policies and service monitors. While this is doable it feels like unnecessary complexity compared to other options.

### Generation of service + monitor

Another alternative approach would be to use a pod selector and port only. We would then generate both a service and servicemonitor, giving us full control of the port names and selectors. This seems like a viable path, but does add an extra resource for us to generate and manage. There could be unknown side effects of generating services that could clash with other services (particularly with istio endpoints). This would otherwise be a relative straightforward approach and is worth evaluating again if we want to simplify the spec later on.
