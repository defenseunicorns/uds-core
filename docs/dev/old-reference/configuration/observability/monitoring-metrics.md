---
title: Monitoring and Metrics
sidebar:
    order: 4.2
---

UDS Core deploys Prometheus to provide metrics collection. Out of the box all applications in UDS Core will have their metrics collected by Prometheus. This document primarily focuses on the integrations and options provided for extending this to monitor any additional applications you would like to deploy.

## Capturing Metrics

There are a few options within UDS Core to collect metrics from your application. Since the prometheus operator is deployed we recommend using the `ServiceMonitor` and/or `PodMonitor` custom resources to capture metrics. These resources are commonly supported in application helm charts and should be used if available. UDS Core also supports generating these resources from the `monitor` list in the `Package` spec, since charts do not always support monitors. This also provides a simplified way for other users to create monitors, similar to the way `VirtualServices` are generated with the `Package` CR. A full example of this can be seen below:

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

:::tip[Checking Prometheus Targets]
When debugging metrics scraping or verifying a new `ServiceMonitor` / `PodMonitor`, you can connect directly to Prometheus from your workstation:

```console
uds zarf connect prometheus
```

This opens a local port-forward to the Prometheus server. In the Prometheus UI you can check `Status -> Target health` to confirm your application’s metrics endpoint is being scraped and is up.

:::
