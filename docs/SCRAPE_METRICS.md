## Metrics Scraping in UDS Core

UDS Core leverages Pepr to handle setup of Prometheus scraping metrics endpoints, with the particular configuration necessary to work in a STRICT mTLS (Istio) environment. We handle this with both mutations of existing service monitors and generation of service monitors via the `Package` CR. 

### Why do this in the operator?

### Why Support Two Methods?

### What is mutated?

### Why not support the full serviceMonitor spec?
