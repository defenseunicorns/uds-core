---
title: Runtime Security Overview
sidebar:
  order: 7
---

UDS Core provides runtime security capabilities to monitor and protect applications during execution. Runtime security solutions detect threats and malicious behavior in real-time across containerized workloads.

## Falco

[Falco](https://falco.org/) is the default runtime security solution in `runtime-security` package layer. Falco is a CNCF graduated project that provides cloud-native runtime security and real-time threat detection.

### Optional: cleanup legacy NeuVector during upgrade

By default, UDS Core does not remove legacy NeuVector resources. To have the runtime-security layer remove the legacy `neuvector` namespace and any `neuvector` CRDs during deploy/upgrade, set:

```bash
# Example: deploy the runtime-security layer with cleanup enabled
zarf package deploy packages/runtime-security --set CLEANUP_LEGACY_NEUVECTOR=true
```

```yaml
# Example: deploy a bundle with cleanup enabled in the uds-config.yaml bundle config
variables:
  core:
    CLEANUP_LEGACY_NEUVECTOR: "true"
```

If you plan to deploy the standalone NeuVector package without Falco, do not enable this gate and skip the runtime-security layer entirely. See the [Runtime Security Migration Guide](/reference/configuration/runtime-security/migration) and [Standalone NeuVector](https://github.com/uds-packages/neuvector/blob/main/docs/neuvector-standalone.md) for advanced scenarios.
