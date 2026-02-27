---
title: UDS Package Resource Tree
---

This diagram illustrates the relationship between the Package CR spec fields and the Kubernetes resources created during reconciliation.

![UDS Package Resource Tree](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/operator-resource-tree.png?raw=true)

## Understanding the Resource Tree

### Default Resources

- **Default-Deny Policy**: Created for every Package to establish a baseline zero-trust posture
- **DNS Egress Policy**: Allows DNS resolution for all workloads in the namespace
- **Service Mesh Configuration**: Based on the `serviceMesh.mode` setting (defaults to `ambient` if not specified):
  - **Sidecar Mode**: Adds namespace labels for sidecar injection and NetworkPolicies for Istiod communication and sidecar monitoring
  - **Ambient Mode**: Adds namespace labels for ambient mode and NetworkPolicies for ambient node healthprobes

### Network Resources

- **NetworkPolicies**: Created from `allow` entries to permit specified traffic patterns
- **Authorization Policies**: Created for ingress rules defined in `allow` entries
- **Remote Host Resources**: When `remoteHost` is specified in `allow` entries:
  - **ServiceEntries**: Define external services for the service mesh
  - **Sidecar Config**: Configure egress traffic rules for sidecars

### Identity Resources

- **Keycloak Clients**: Created from `sso` entries based on provided configuration
- **Authservice Resources**: When `enableAuthserviceSelector` is enabled:
  - **Authservice Config**: Configure Authservice chains
  - **NetworkPolicies**: Allow egress to Authservice and Keycloak
  - **Authorization Policies and Request Authentication**: Provide protection on the workload with Istio custom resources

### Ingress Resources

- **NetworkPolicies**: Allow ingress traffic from gateways based on `expose` entries
- **Authorization Policies**: Permit traffic from gateways to exposed services
- **VirtualServices**: Route traffic from gateways to internal services
- **ServiceEntries**: Define routes for in-cluster traffic to the gateway for exposed hosts

### Monitoring Resources

- **NetworkPolicies**: Allow Prometheus to scrape metrics endpoints
- **Authorization Policies**: Permit Prometheus traffic to monitoring targets
- **ServiceMonitors/PodMonitors**: Created based on the `kind` field in `monitor` entries (defaults to `ServiceMonitor` if not specified)

## How Resources Connect

The Package reconciliation process establishes connections between resources through:

1. **Owner References**: Created resources have the Package CR as their owner, ensuring cleanup when the Package is deleted
2. **Matching Selectors**: NetworkPolicies and AuthorizationPolicies use selectors from the Package spec to target specific workloads
3. **Shared Labels**: Resources share common labels like `uds/package` and `uds/generation` for tracking and management
