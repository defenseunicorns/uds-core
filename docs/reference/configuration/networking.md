---
title: Networking & Service Mesh
sidebar:
  order: 2.2
---

UDS Core provides opinionated networking on top of Kubernetes and Istio through the Package CR's `network` spec. Bundle operators declare `expose` rules (ingress via Istio gateways) and `allow` rules (NetworkPolicy generation), and the UDS Operator translates those declarations into VirtualServices, NetworkPolicies, and AuthorizationPolicies. For the full Package CR schema, see [Packages CR reference](/reference/operator-and-crds/packages-v1alpha1-cr/).

## Gateways

UDS Core ships three built-in Istio gateways. The `expose.gateway` field selects which one to use. If omitted, `tenant` is used.

| Gateway | Purpose | TLS behavior |
|---|---|---|
| `tenant` | Default gateway for user-facing application traffic | TLS terminates at the gateway |
| `admin` | Internal or administrative traffic (e.g., Keycloak admin console, Grafana) | TLS terminates at the gateway |
| `passthrough` | Workloads that require end-to-end TLS (e.g., mTLS to a backend) | TLS passes through to the backend; Istio does not terminate |

Custom gateways can be added for use cases that require a separate domain. Custom gateway entries require the `expose.domain` field; this field is not valid for the built-in `tenant`, `admin`, or `passthrough` gateways.

## Exposing services

Each entry in `spec.network.expose` creates an Istio VirtualService (and supporting resources) that routes inbound traffic to a Kubernetes Service. For the full field-level schema including `advancedHTTP`, `match`, and `uptime` sub-fields, see [Packages CR reference — Expose](/reference/operator-and-crds/packages-v1alpha1-cr/#Expose).

## Network allow rules

Each entry in `spec.network.allow` generates a Kubernetes NetworkPolicy. Namespaces that have a Package CR receive a default-deny policy; allow entries open specific traffic paths. For the full field-level schema, see [Packages CR reference — Allow](/reference/operator-and-crds/packages-v1alpha1-cr/#Allow).

> [!NOTE]
> `selector` and `remoteSelector` replace the deprecated `podLabels` and `remotePodLabels` fields.

### remoteGenerated values

The `remoteGenerated` field provides named selectors for common traffic destinations, avoiding the need to specify CIDRs or selectors manually.

| Value | Allows traffic to or from |
|---|---|
| `KubeAPI` | The Kubernetes API server |
| `KubeNodes` | All cluster nodes |
| `IntraNamespace` | All pods within the same namespace |
| `CloudMetadata` | Cloud instance metadata endpoint (e.g., 169.254.169.254) |
| `Anywhere` | All destinations (0.0.0.0/0) |

## Service mesh mode

The `spec.network.serviceMesh.mode` field sets the Istio data-plane mode for the package's namespace.

| Value | Description |
|---|---|
| `ambient` | Default. Uses Istio ambient mode; no sidecars are injected into the namespace |
| `sidecar` | Uses sidecar injection; an Envoy proxy is injected into each pod |

## Related documentation

- [Networking & service mesh how-to guides](/how-to-guides/networking/overview/) — task-oriented guides for configuring ingress, egress, gateways, and more
- [Istio VirtualService documentation](https://istio.io/latest/docs/reference/config/networking/virtual-service/) — upstream Istio reference for VirtualService behavior
- [Istio Gateway documentation](https://istio.io/latest/docs/reference/config/networking/gateway/) — upstream Istio reference for Gateway configuration
