---
title: UDS Package Resource Tree
---

This diagram illustrates the relationship between the Package CR spec fields and the Kubernetes resources created during reconciliation.

![UDS Package Resource Tree](https://github.com/defenseunicorns/uds-core/blob/operator-resource-tree/docs/.images/diagrams/operator-resource-tree.png?raw=true)

## Understanding the Resource Tree

The diagram above illustrates how various fields in the UDS Package spec map to Kubernetes resources created during reconciliation. Resources are created in a specific order during reconciliation, and the diagram groups them accordingly.

### Default Resources

- **Default-Deny Policy**: Created for every Package to establish a baseline zero-trust posture
- **DNS Egress Policy**: Allows DNS resolution for all workloads in the namespace
- **Service Mesh Configuration**: Based on the `serviceMesh.mode` setting (defaults to `sidecar` if not specified):
  - **Sidecar Mode**: Adds namespace labels for sidecar injection and NetworkPolicies for Istiod communication
  - **Ambient Mode**: Adds namespace labels for ambient mode and NetworkPolicies for healthprobes and ztunnel traffic (port 15008)

### Network Resources

- **NetworkPolicies**: Created from `allow` entries to permit specified traffic patterns
- **Authorization Policies**: Created for ingress rules defined in `allow` entries
- **Remote Host Resources**: When `remoteHost` is specified in `allow` entries:
  - **ServiceEntries**: Define external services for the service mesh
  - **Sidecar Config**: Configure egress traffic rules for sidecars

### Identity Resources

- **Keycloak Clients**: Created from `sso` entries to establish identity providers
- **Authservice Resources**: When `enableAuthserviceSelector` is enabled:
  - **Authservice Config**: Configure authentication service
  - **NetworkPolicies**: Allow egress to Authservice and Keycloak

### Ingress Resources

- **NetworkPolicies**: Allow ingress traffic from gateways based on `expose` entries
- **Authorization Policies**: Permit traffic from gateways to exposed services
- **VirtualServices**: Route traffic from gateways to internal services
- **ServiceEntries**: Define external services when needed for exposed routes

### Monitoring Resources

- **NetworkPolicies**: Allow Prometheus to scrape metrics endpoints
- **Authorization Policies**: Permit Prometheus traffic to monitoring targets
- **ServiceMonitors/PodMonitors**: Created based on the `kind` field in `monitor` entries (defaults to `ServiceMonitor` if not specified)

## How Resources Connect

The Package reconciliation process establishes connections between resources through:

1. **Owner References**: Created resources have the Package CR as their owner, ensuring cleanup when the Package is deleted
2. **Matching Selectors**: NetworkPolicies and AuthorizationPolicies use selectors from the Package spec to target specific workloads
3. **Shared Labels**: Resources share common labels like `uds/package` and `uds/generation` for tracking and management
