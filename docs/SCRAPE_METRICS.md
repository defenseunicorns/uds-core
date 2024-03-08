## Metrics Scraping in UDS Core

UDS Core leverages Pepr to handle setup of Prometheus scraping metrics endpoints, with the particular configuration necessary to work in a STRICT mTLS (Istio) environment. We handle this with both mutations of existing service monitors and generation of service monitors via the `Package` CR. 

### Mutations

Existing service monitors are mutated to set the scrape scheme to HTTPS and set the TLS Config to what is required for Istio mTLS scraping (see [this doc](https://istio.io/latest/docs/ops/integrations/prometheus/#tls-settings) for details). Beyond this, no other fields are mutated. Supporting existing service monitors is useful since some charts include service monitors by default with more advanced configurations, and it is in our best interest to enable those and use them where possible.

NOTE: We may make some assumptions about STRICT mTLS here for simplicity, based on the `istio-injection` namespace label. Without making these assumptions we would need to query `PeerAuthentication` resources unless a more sane alternative is found to determine the mTLS status of a given work load.

### Package CR `monitor` field

Beyond mutations we also support generating service monitors from the `monitor` list in the `Package` spec. Charts do not always support service monitors, and even when they do they may not support the necessary `tlsConfig` values we need. This also provides a simplified way for other users to create service monitors, similar to the way we handle `VirtualServices` today. A full example of this can be seen below:

```yaml
...
spec:
  monitor:
    - description: "foobar monitor"
      port: 1234
      selector:
        app: foobar
      path: "/mymetrics" # Optional, defaults to `/metrics`
```

NOTE: This intentionally does not support the full service monitor spec. While we may add additional fields in the future, we do not want to add fields that are not necessary for the majority of users. The current subset is based on the general common patterns seen.

This config will be used to generate a service monitor and corresponding network policy to setup scraping for your application. The monitor will have the necessary `tlsConfig` and `scheme` to work in an istio environment. In generating the network policy we will need to lookup the corresponding service to get pod labels and target port information. While we could have these explicitly set in the CR, this creates extra work for the end user and a lookup is already necessary to map port number -> name based on what is required in the service monitor spec.
