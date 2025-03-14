# Linkerd2 Service Mesh

This directory contains testing scripts and data collected from resource/performance testing of Linkerd2 against different workload and request scales. UDS Core does not support swapping out the service mesh but this is here strictly as a comparison between Istio performance and Linkerd2.

## Summary of results

As expected, Linkerd2 outperforms Istio for request latency and CPU utilization. Due to its sidecar model, the memory usage grows linearlly with workloads similar to Istio Sidecar although it does have a smaller memory footprint. Istio Ambient mode provides significant memory savings over Linkerd2 especially at higher workloads.

For a detailed comparison see [this doc](./comparison.md)

For the full results of each test see [this doc](./Linkerd2.md)

## Specific Data Points

Linkerd2 control plane requires slightly more resources to run at base configuration than Istio.

Each Linkerd2 sidecar typically required ~1 CPU millicores and ~3Mi of memory for each sidecar.

Request latency for Linkerd2 is extremely low, consitently coming in around 0.5ms which is around a 2x perforamnce increase over Istio. At higher workloads Istio Ambient provided around a 50% reduction in memory footprint (1.5G versus less than 1G)

