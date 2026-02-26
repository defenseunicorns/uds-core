---
title: Logging
sidebar:
  order: 5
---

## Logging reference

Log collection, storage, and querying are primarily defined by the upstream components (for example, Vector and Loki).
UDS Core should avoid duplicating those reference docs.

This subsection should only document Core-specific configuration and behavior that wraps those components (for example,
which values are exposed for tuning, or how log labels are structured by default), if we decide to document them at
all.

Task-based guides ("query logs", "configure retention") should live in **How-to Guides → Logging** and link to
upstream product docs where appropriate.

### Source material from previous docs

- `src/content/docs-old/reference/configuration/loki-storage.md`
- `src/content/docs-old/reference/configuration/observability/logging-alerting.md` *(split: alerting steps to how-to, keep configuration reference here)*
