---
title: Networking & Service Mesh
sidebar:
  order: 3
---

## Networking & service mesh reference

This subsection should contain **UDS Core-specific** networking and mesh configuration reference. General Istio and
Kubernetes networking behavior should be covered by upstream docs.

Include here only things that are Core-specific or opinionated, such as:

- Supported and recommended patterns for ingress/gateway configuration.
- How Core configures egress and what knobs are exposed to bundle authors.
- How default `AuthorizationPolicy` behavior is wired for Core workloads.
- Any UDS-specific guidance on sidecar vs ambient modes, with links to upstream Istio docs for full details.

How-to pages should live under **How-to Guides → Networking & service mesh** and link back here only when they need
to reference specific fields or default behaviors.

### Source material from previous docs

- `src/content/docs-old/reference/configuration/Service Mesh/ingress.md` *(often mixed; split steps to how-to, keep matrices/knobs here)*
- `src/content/docs-old/reference/configuration/Service Mesh/egress.md` *(often mixed; split steps to how-to, keep matrices/knobs here)*
- `src/content/docs-old/reference/configuration/Service Mesh/custom-gateways.md`
- `src/content/docs-old/reference/configuration/Service Mesh/non-http-ingress.md`
- `src/content/docs-old/reference/configuration/Service Mesh/authorization-policies.md`
- `src/content/docs-old/reference/configuration/Service Mesh/istio-sidecar-vs-ambient.md`
- `src/content/docs-old/reference/configuration/uds-networking-configuration.md`
