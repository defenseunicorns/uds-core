---
title: UDS Core
---

## Reference

This section is intentionally **narrow**. It exists for places where UDS Core has concrete, stable configuration
surfaces or behaviors that are not better documented upstream. In practice, reference is organized around a small set
of topics:

- **CLI behavior and validation** – how the UDS CLI behaves and validates input.
- **Networking & service mesh** – UDS-specific networking configuration on top of Istio.
- **Identity & access** – SSO/identity configuration surfaces.
- **Operator & CRDs** – UDS Operator behavior and CRD schemas.
- **Logging storage** – Core-specific logging storage configuration.

For most core features (logging, metrics, dashboards, runtime security, Velero, Grafana, Vector, etc.), we rely
primarily on:

- **How-to Guides** and **Operations & Maintenance** docs for UDS-specific workflows.
- **Upstream product documentation** for detailed technical reference.

Reference pages here should focus on exact fields, knobs, defaults, and behavior. If a page is primarily step-by-step
or conceptual, it likely belongs in **How-to Guides**, **Concepts**, or **Operations & Maintenance**, with this section
linked only for the exact configuration details.

### Source material from previous docs

The new reference section is primarily built by restructuring content from:

- `src/content/docs-old/reference/`
- `src/content/docs-old/reference/configuration/`
