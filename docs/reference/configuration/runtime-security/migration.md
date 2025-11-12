---
title: Runtime Security Migration Guide
---

This guide describes how to migrate to the new default runtime security posture in UDS Core, where Falco is the required solution and NeuVector is no longer managed by UDS Core.

UDS Core now:
- Includes Falco by default in the `core-runtime-security` layer.
- Does not manage NeuVector. If you still need NeuVector, deploy it as a standalone package.

## Different Scenarios

- **Falco only (remove legacy NeuVector on upgrade)**
  - Enable the cleanup gate during runtime-security deploy to remove legacy NeuVector resources (upgrade-only):
    - Runtime Security Package:
      ```bash
      zarf package deploy packages/runtime-security --set CLEANUP_LEGACY_NEUVECTOR=true --confirm
      ```
    - Standard package:
      ```bash
      zarf package deploy packages/standard --set CLEANUP_LEGACY_NEUVECTOR=true --confirm
      ```
    - Use a uds-config.yaml to set at the bundle level:
      ```yaml
      variables:
        core:
          CLEANUP_LEGACY_NEUVECTOR: "true"
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
