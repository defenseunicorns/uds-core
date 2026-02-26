---
title: Harden control plane failover
sidebar:
  order: 2
---

## High availability & resilience

This section provides task-oriented guides for configuring UDS Core for high availability and production resilience. High availability is critical for mission-critical deployments and deserves dedicated attention beyond general operations documentation.

**Key topics covered:**
- Configuring component redundancy (multiple replicas)
- Setting up horizontal pod autoscaling
- Distributing workloads across availability zones
- Configuring pod disruption budgets
- Implementing health checks and readiness probes
- Resource requests and limits for stable operation
- Node affinity and anti-affinity patterns

**Why it's separate from Operations:** Operations focuses on day-2 concerns (troubleshooting, upgrades, maintenance), while HA is a proactive configuration task that platform engineers do during initial setup and scaling.

**Target audience:** Platform engineers deploying production UDS Core instances who need resilience and uptime guarantees.

#### Source Material from Previous Docs

This section consolidates content from:
- `src/content/docs-old/reference/configuration/resource-configuration-and-ha.md` (HA patterns and scaling)
- `src/content/docs-old/reference/uds-core/prerequisites.md` (capacity planning sections)
- `src/content/docs-old/reference/configuration/uds-cluster-configuration.md` (cluster-level HA config)
- Various references to HA in feature-specific docs (Istio HA, Keycloak HA, etc.)
