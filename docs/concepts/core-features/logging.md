---
title: Logging
sidebar:
  order: 4
---

## Logging in UDS Core

UDS Core provides centralized logging for platform and workloads using components such as Vector and Loki. Conceptually:

- Logs are collected from workloads and platform components.
- They are shipped to centralized storage where they can be searched and correlated.

This page will describe the high‑level logging pipeline, what types of logs are available, and how this supports
troubleshooting and audit use cases.

### Source material from previous docs

Relevant background material from the previous docs includes:

- `src/content/docs-old/reference/configuration/observability/overview.mdx`
- `src/content/docs-old/reference/configuration/observability/logging-alerting.md`
- `src/content/docs-old/reference/configuration/loki-storage.md`
