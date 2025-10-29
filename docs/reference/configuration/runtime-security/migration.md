---
title: Runtime Security Migration Guide
---

This guide describes how to migrate to the new default runtime security posture in UDS Core, where Falco is the required solution and NeuVector is no longer managed by Core.

UDS Core now:
- Includes Falco by default in the `core-runtime-security` layer.
- Does not manage NeuVector. If you still need NeuVector, deploy it as a standalone package.

## Choose your path

- **Falco only (remove legacy NeuVector on upgrade)**
  - Enable the cleanup gate during runtime-security deploy to remove legacy NeuVector resources (upgrade-only):
    - Package level:
      ```bash
      zarf package deploy packages/runtime-security --set CLEANUP_LEGACY_NEUVECTOR=true --confirm
      ```
    - Bundle level:
      ```bash
      uds deploy bundles/neuvector-standalone/uds-bundle-neuvector-standalone-amd64-0.1.0.tar.zst --set CLEANUP_LEGACY_NEUVECTOR=true --confirm
      ```
  - This deletes the legacy `neuvector` namespace and any CRDs whose names contain `neuvector` if they exist.

- **Falco + NeuVector (keep NeuVector)**
  - Do NOT enable the cleanup gate.
  - Deploy NeuVector as a standalone package and follow its upgrade guidance:
    - See: [Standalone NeuVector](https://github.com/uds-packages/neuvector/blob/main/docs/neuvector-standalone.md)
  - Outcome: both Falco and NeuVector run together.

- **NeuVector only (no Falco)**
  - Omit the `core-runtime-security` layer and follow the standalone NeuVector guide:
    - See: [Standalone NeuVector](https://github.com/uds-packages/neuvector/blob/main/docs/neuvector-standalone.md)
