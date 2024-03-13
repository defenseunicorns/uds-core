## Metrics Scraping in UDS Core

UDS Core leverages Pepr to handle setup of Prometheus scraping metrics endpoints, with the particular configuration necessary to work in a STRICT mTLS (Istio) environment. We handle this with both mutations of existing service monitors and generation of service monitors via the `Package` CR. 

### Mutations

Existing service monitors are mutated to set the scrape scheme to HTTPS and set the TLS Config to what is required for Istio mTLS scraping (see [this doc](https://istio.io/latest/docs/ops/integrations/prometheus/#tls-settings) for details). Beyond this, no other fields are mutated. Supporting existing service monitors is useful since some charts include service monitors by default with more advanced configurations, and it is in our best interest to enable those and use them where possible.

Assumptions are made about STRICT mTLS here for simplicity, based on the `istio-injection` namespace label. Without making these assumptions we would need to query `PeerAuthentication` resources or another resource to determine the exact workload mTLS posture.

### Package CR `monitor` field

Beyond mutations we also support generating service monitors from the `monitor` list in the `Package` spec. Charts do not always support service monitors, and even when they do they may not support the necessary `tlsConfig` values we need. This also provides a simplified way for other users to create service monitors, similar to the way we handle `VirtualServices` today. A full example of this can be seen below:

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
      podSelector: # Add if pod labels are different than `selector` (for network policy)
        app: barfoo
      path: "/mymetrics" # Add if metrics are exposed on a different path than "/metrics"
```

This config is used to generate service monitors and corresponding network policies to setup scraping for your applications. The `ServiceMonitor`s will have the necessary `tlsConfig` and `scheme` to work in an istio environment. 

This spec intentionally does not support all options available with a `ServiceMonitor`. While we may add additional fields in the future, we do not want to simply rebuild the `ServiceMonitor` spec since mutations are already available to handle Istio specifics. The current subset of spec options is based on the bare minimum necessary to craft resources.

NOTE: While this is a rather verbose spec, each of the above fields are strictly required to craft the necessary service monitor and network policy resources. We could lookup some of these values if we assumed the service already existed (selectors, ports, etc), but this would result in new challenges to handle upgrades when those values change (to ensure that pepr is watching for changes and updating the dependent resources appropriately). This more verbose spec provides the best of both worlds - a simplified interface compared to the `ServiceMonitor` spec, and a faster/easier reconciliation loop.
