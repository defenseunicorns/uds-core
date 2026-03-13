---
title: Networking & Service Mesh
sidebar:
  order: 3
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

Each entry in `spec.network.expose` creates an Istio VirtualService (and supporting resources) that routes inbound traffic to a Kubernetes Service.

| Field | Type | Default | Description |
|---|---|---|---|
| `host` | string | — | Hostname prefix combined with the cluster domain to form the full FQDN |
| `gateway` | string | `tenant` | Gateway to expose on: `tenant`, `admin`, `passthrough`, or a custom gateway name |
| `domain` | string | — | Domain suffix; required for custom gateways, not valid for built-in gateways |
| `service` | string | — | Name of the Kubernetes Service to route traffic to |
| `port` | number | — | Service port to target |
| `targetPort` | number | value of `port` | Pod port if different from the service port; used for NetworkPolicy generation |
| `selector` | map | — | Pod label selector for NetworkPolicy generation |
| `description` | string | — | Included in the generated VirtualService name |
| `match` | Match[] | — | Deprecated: use `advancedHTTP.match`. URI or method match conditions; not valid for the `passthrough` gateway |
| `advancedHTTP` | AdvancedHTTP | — | CORS policy, headers, retries, rewrites, redirects, and timeouts |
| `uptime` | Uptime | — | Blackbox probe paths for uptime monitoring via the [Uptime checks](/reference/operator-and-crds/packages-v1alpha1-cr/#Uptime) spec |

For full `advancedHTTP` and `match` sub-fields, see [Packages CR reference](/reference/operator-and-crds/packages-v1alpha1-cr/#Expose).

## Network allow rules

Each entry in `spec.network.allow` generates a Kubernetes NetworkPolicy. Namespaces that have a Package CR receive a default-deny policy; allow entries open specific traffic paths.

| Field | Type | Default | Description |
|---|---|---|---|
| `direction` | `Ingress` \| `Egress` | — | Traffic direction relative to the package namespace |
| `selector` | map | all pods | Pod label selector for the source or destination within this namespace |
| `remoteNamespace` | string | — | Namespace to allow traffic to or from; `*` or empty allows all namespaces |
| `remoteSelector` | map | — | Pod label selector in the remote namespace |
| `remoteGenerated` | string | — | Named remote target (see table below) |
| `remoteCidr` | string | — | CIDR block for external traffic destinations |
| `remoteHost` | string | — | External hostname for outbound traffic |
| `remoteProtocol` | `TLS` \| `HTTP` | — | Protocol for external connections via `remoteHost` |
| `port` | number | — | Single port to allow (TCP) |
| `ports` | number[] | — | Multiple ports to allow (TCP) |
| `serviceAccount` | string | — | Restrict egress to a specific service account in this namespace; valid for Egress only |
| `remoteServiceAccount` | string | — | Restrict ingress to a specific service account in the remote namespace; valid for Ingress only |
| `description` | string | — | Included in the generated NetworkPolicy name |

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

- [Packages CR reference](/reference/operator-and-crds/packages-v1alpha1-cr/) — full field-level schema for all Package CR networking fields
- [Packages CR overview](/reference/operator-and-crds/package/) — how the UDS Operator processes Package CRs
- [Networking & service mesh how-to guides](/how-to-guides/networking/) — task-oriented guides for configuring ingress, egress, gateways, and more
- [Istio VirtualService documentation](https://istio.io/latest/docs/reference/config/networking/virtual-service/) — upstream Istio reference for VirtualService behavior
- [Istio Gateway documentation](https://istio.io/latest/docs/reference/config/networking/gateway/) — upstream Istio reference for Gateway configuration
