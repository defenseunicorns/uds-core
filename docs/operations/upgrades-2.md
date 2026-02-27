---
title: Upgrades & configuration changes 2
sidebar:
  order: 4
---

## Upgrades & configuration changes

This page should describe how to think about both upgrading UDS Core over time and making planned configuration or
secret changes safely.

Include here:

- Supported/typical upgrade paths and any versioning guarantees.
- Operational expectations around release cadence and planning.
- High-level guidance on scheduling, maintenance windows, and pre/post checks.
- How to plan and execute configuration/secret changes (for example, using pod-reload) without unexpected downtime.

Step-by-step upgrade commands and any environment-specific flows (for example, RKE2 specifics) should live in
**How-to Guides**, with this page linking to them for concrete procedures.

### Source material from previous docs

- `src/content/docs-old/reference/deployment/upgrades.md` *(mixed; pull planning/behavior details here, move shell examples to How-to/Ops runbooks)*
- `src/content/docs-old/reference/deployment/pod-reload.md` *(mixed; use for config/secret change behavior and safe rollout patterns)*
- `src/content/docs-old/reference/UDS Core/release-overview.md` *(mixed; planning and support policy belong here, marketing-style overview may move to Concepts)*
