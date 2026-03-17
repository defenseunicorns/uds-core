---
title: Networking & Service Mesh
sidebar:
  order: 2.2
---

UDS Core provides opinionated networking on top of Kubernetes and Istio through the Package CR's `network` spec. Bundle operators declare `expose` rules (ingress via Istio gateways) and `allow` rules (NetworkPolicy generation), and the UDS Operator translates those declarations into VirtualServices, NetworkPolicies, and AuthorizationPolicies.

For complete field-level schema documentation, see [Packages CR reference](/reference/operator-and-crds/packages-v1alpha1-cr/).

## Gateways

UDS Core ships three built-in Istio gateways and supports custom gateways for additional use cases. The `expose.gateway` field selects which one to use. If omitted, `tenant` is used.

| Gateway | Purpose | TLS behavior |
|---|---|---|
| `tenant` | Default gateway for user-facing application traffic | TLS terminates at the gateway |
| `admin` | Internal or administrative traffic (e.g., Keycloak admin console, Grafana) | TLS terminates at the gateway |
| `passthrough` | Workloads that require end-to-end TLS (e.g., mTLS to a backend). See [Enable and use the passthrough gateway](/how-to-guides/networking/enable-passthrough-gateway/). | TLS passes through to the backend; Istio does not terminate |
| Custom | Additional gateways for use cases that require a separate domain. Requires the `expose.domain` field; not valid for built-in gateways. See [Create a custom gateway](/how-to-guides/networking/create-custom-gateways/). | Configured per custom gateway |

## Exposing services

Each entry in `spec.network.expose` creates an Istio VirtualService (and supporting resources) that routes inbound traffic to a Kubernetes Service. See [Packages CR reference — Expose](/reference/operator-and-crds/packages-v1alpha1-cr/#Expose) for the full field-level schema.

## Network allow rules

Each entry in `spec.network.allow` generates a Kubernetes NetworkPolicy. Namespaces that have a Package CR receive a default-deny policy; allow entries open specific traffic paths. See [Packages CR reference — Allow](/reference/operator-and-crds/packages-v1alpha1-cr/#Allow) for the full field-level schema, including all `remoteGenerated` values.

> [!NOTE]
> `selector` and `remoteSelector` replace the deprecated `podLabels` and `remotePodLabels` fields.

## Service mesh mode

The `spec.network.serviceMesh.mode` field sets the Istio data-plane mode for the package's namespace. See [Packages CR reference — ServiceMesh](/reference/operator-and-crds/packages-v1alpha1-cr/#ServiceMesh) for the full field-level schema.

## Related documentation

- [Networking & service mesh how-to guides](/how-to-guides/networking/overview/) — task-oriented guides for configuring ingress, egress, gateways, and more
- [Istio VirtualService documentation](https://istio.io/latest/docs/reference/config/networking/virtual-service/) — upstream Istio reference for VirtualService behavior
- [Istio Gateway documentation](https://istio.io/latest/docs/reference/config/networking/gateway/) — upstream Istio reference for Gateway configuration
