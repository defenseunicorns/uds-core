---
title: Networking
sidebar:
  order: 1
---

## Networking and Service Mesh in UDS Core

The service mesh in UDS Core is responsible for secure, observable communication between workloads. It is built on
Istio and provides:

- mTLS for in‑cluster traffic.
- Traffic routing and load balancing.
- Fine‑grained authorization and explicit egress.

This page will describe the mental model for how the mesh is wired into UDS Core, how application traffic flows through
it, and how this relates to configuration options in the Reference and How‑to Guides.

### Source material from previous docs

Relevant background material from the previous docs includes:

- `src/content/docs-old/reference/configuration/Service Mesh/ingress.md`
- `src/content/docs-old/reference/configuration/Service Mesh/egress.md`
- `src/content/docs-old/reference/configuration/Service Mesh/custom-gateways.md`
- `src/content/docs-old/reference/configuration/Service Mesh/non-http-ingress.md`
- `src/content/docs-old/reference/configuration/Service Mesh/authorization-policies.md`
- `src/content/docs-old/reference/configuration/Service Mesh/istio-sidecar-vs-ambient.md`
- `src/content/docs-old/reference/configuration/uds-networking-configuration.md`
