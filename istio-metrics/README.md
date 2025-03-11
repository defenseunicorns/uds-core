# Resource Metrics for Istio Modes

This directory contains testing scripts and data collected from resource/performance testing of different istio modes against different workload and request scales.

Three istio "modes" were tested:
- Sidecar: Istio with sidecars per workload
- Ambient: Istio ambient (ztunnel proxy)
- Ambient w/ Authorization Policy: Istio ambient with added L4 (port-based) authorization policies

## Summary of results

For Istio Ambient, resource usage follows a harmonic scaling relative to the sidecar model. The per-workload overhead decreases as more workloads are added because workloads share the same ztunnel instances instead of running separate sidecars. This follows an approximate 1/X scaling, meaning that for the first workload, resource usage is comparable to a sidecar (1:1), but as more workloads are added, the per-workload overhead drops.
This means that:
- With few workloads, Istio Ambient can have comparable or even slightly higher resource usage due to the overhead of maintaining ztunnel and the CNI plugin.
- As the number of workloads increases, the per-workload cost significantly decreases, leading to much lower overall resource consumption compared to sidecars.

The addition of port-based Authorization Policies has no noticeable effect on resource usage in preliminary testing. This should likely be evaluated with full (generated) Authorization Policies, but the example ones tested with represent a "normal" amount of policies.

While not the main focus of this testing, we also noted that latency tends to be lower in ambient mode (especially at the peaks). In all tests modes no failures were experienced in requests, although failures could likely be hit with more complex workloads and higher request rates.

## Specific Data Points

Sidecar mode typically required ~8 CPU millicores and ~40Mi of memory for each sidecar.

Ambient mode required a fraction of the overall resources (when considering Istio namespaces + the application namespace) that sidecar mode required past a single workload pod:
- 1 pod: Similar resource usage
- 10 pods: Somewhere between 1/2 and 1/4 the resource usage
- 50 pods: Around 1/4 the resource usage
- 90 pods: Around 1/5 the resource usage

Resource usage of istio-cni and ztunnel is extremely low even at load (peaks around 10 CPU millicores and 40Mi memory, similar to the cost of a single sidecar). Noticeably istiod seemed to require less resourcing in ambient mode (likely due to fewer/no sidecars to configure and manage), so the overall `istio-system` resource usage was similar or even lower in ambient mode at scale.
