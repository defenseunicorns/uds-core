---
title: Monitoring and Metrics
type: docs
weight: 1
---

UDS Core leverages Pepr to handle setup of Prometheus scraping metrics endpoints, with the particular configuration necessary to work in a STRICT mTLS (Istio) environment. We handle this via a default scrapeClass in prometheus to add the istio certs. When a monitor needs to be exempt from that tlsConfig a mutation is performed to leverage a plain scrape class without istio certs.

## Mutations

Note: The below implementation has been deprecated in favor of a default `scrapeClass` with the file-based `tlsConfig` required for istio mTLS in prometheus automatically, supplemented with a mutation of `scrapeClass: exempt` that exempts monitors from the `tlsConfig` required for istio if the destination namespace is not istio injected (e.g. kube-system), unless the `uds/skip-sm-mutate` annotation is specified. The mutation behavior stated in the paragraph immediately below this section will be removed in a later release.

All service monitors are mutated to set the scrape scheme to HTTPS and set the TLS Config to what is required for Istio mTLS scraping (see [this doc](https://istio.io/latest/docs/ops/integrations/prometheus/#tls-settings) for details). Beyond this, no other fields are mutated. Supporting existing service monitors is useful since some charts include service monitors by default with more advanced configurations, and it is in our best interest to enable those and use them where possible.

Assumptions are made about STRICT mTLS here for simplicity, based on the `istio-injection` namespace label. Without making these assumptions we would need to query `PeerAuthentication` resources or another resource to determine the exact workload mTLS posture.

Note: This mutation is the default behavior for all service monitors but can be skipped using the annotation key `uds/skip-sm-mutate` (with any value). Skipping this mutation should only be done if your service exposes metrics on a PERMISSIVE mTLS port.

## Package CR `monitor` field

UDS Core also supports generating `ServiceMonitors` and/or `PodMonitors` from the `monitor` list in the `Package` spec. Charts do not always support monitors, so generating them can be useful. This also provides a simplified way for other users to create monitors, similar to the way we handle `VirtualServices` today. A full example of this can be seen below:

```yaml
...
spec:
  monitor:
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
```

This config is used to generate service monitors and corresponding network policies to setup scraping for your applications. The `ServiceMonitor`s will go through the mutation process to add `tlsConfig` and `scheme` to work in an istio environment.

This spec intentionally does not support all options available with a `ServiceMonitor`. While we may add additional fields in the future, we do not want to simply rebuild the `ServiceMonitor` spec since mutations are already available to handle Istio specifics. The current subset of spec options is based on the bare minimum necessary to craft resources.

NOTE: While this is a rather verbose spec, each of the above fields are strictly required to craft the necessary service monitor and network policy resources.

## Notes on Alternative Approaches

In coming up with this feature a few alternative approaches were considered but not chosen due to issues with each one. The current spec provides the best balance of a simplified interface compared to the `ServiceMonitor` spec, and a faster/easier reconciliation loop.

### Generation based on service lookup

An alternative spec option would use the service name instead of selectors/port name. The service name could then be used to lookup the corresponding service and get the necessary selectors/port name (based on numerical port). There are however 2 issues with this route:

1. There is a timing issue if the `Package` CR is applied to the cluster before the app chart itself (which is the norm with our UDS Packages). The service would not exist at the time the `Package` is reconciled. We could lean into eventual consistency here, if we implemented a retry mechanism for the `Package`, which would mitigate this issue.
2. We would need an "alert" mechanism (watch) to notify us when the service(s) are updated, to roll the corresponding updates to network policies and service monitors. While this is doable it feels like unnecessary complexity compared to other options.

### Generation of service + monitor

Another alternative approach would be to use a pod selector and port only. We would then generate both a service and servicemonitor, giving us full control of the port names and selectors. This seems like a viable path, but does add an extra resource for us to generate and manage. There could be unknown side effects of generating services that could clash with other services (particularly with istio endpoints). This would otherwise be a relative straightforward approach and is worth evaluating again if we want to simplify the spec later on.
