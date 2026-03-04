# 9. Standalone CRD functional layer

Date: 2026-03-04

## Status

Proposed

## Context

UDS Core's functional layers (see [ADR 0002](./0002-uds-core-functional-layers.md)) require the Base layer as a foundation for all deployments. The Base layer includes Istio, the UDS Operator, and the UDS Policy Engine (Pepr). However, some cluster environments require pre-existing infrastructure components — such as MetalLB, Rook-Ceph, OpenEBS, or other storage/load balancer controllers — to be installed before UDS Core Base can be deployed.

These infrastructure components commonly need UDS policy exemptions (`Exemption` custom resources) to function correctly once the UDS Policy Engine becomes active. Without the CRDs present at the time these components are deployed, there is no way to create exemption resources alongside them. This creates a chicken-and-egg problem: the policy engine in Base will enforce policies on components that were installed before exemptions could be defined, causing policy violations during upgrades or later reconciliation.

## Decision

We will introduce a new functional layer, **CRDs** (`core-crds`), that contains only the standalone UDS Core Custom Resource Definitions:

- `Package` (`packages.uds.dev`)
- `Exemption` (`exemptions.uds.dev`)
- `ClusterConfig` (`clusterconfigs.uds.dev`)

This layer has no dependencies on any other UDS Core layer and can be deployed as the very first layer in a bundle. When the Base layer (or full Core package) is subsequently deployed, its CRD installation will be a no-op upgrade since the CRDs are already present.

This is an addendum to [ADR 0002](./0002-uds-core-functional-layers.md), updating the functional layers to:

0. UDS Core CRDs (standalone CRDs — no dependencies)
1. UDS Core Base (Istio + Pepr w/UDS Operator & UDS Policies)
2. UDS Core Identity and Authorization (Keycloak + AuthService)
3. UDS Core Metrics (Metrics Server)
4. UDS Core Monitoring (Prometheus + Grafana)
5. UDS Core Logging (Promtail + Loki)
6. UDS Core Runtime Security (Falco)
7. UDS Core Backup and Restore (Velero)
8. UDS Core (combination of all layers)

## Consequences

### Positive

- Solves the chicken-and-egg problem for pre-core infrastructure components that need policy exemptions
- No impact on existing deployments — the CRDs layer is optional and additive
- The CRDs layer is lightweight (no images, no running workloads) so it adds negligible overhead
- CRDs deployed by the standalone layer are compatible with the Base layer's CRD installation (idempotent upgrade)

### Negative

- Previously installs tightly couple CRDs and the Operator, ensuring these were upgrade synchronously. There is a slight risk that end users upgrade the CRDs without upgrading the operator (or vice-versa).

## Alternatives Considered

1. **Embedding CRDs into a custom Zarf init package**: This is a viable approach that we may want to consider down the road, but would be a larger decision to make.
2. **Documenting manual `kubectl apply` of CRD manifests**: Rejected because it bypasses the Zarf package workflow and is harder to version and reproduce.
