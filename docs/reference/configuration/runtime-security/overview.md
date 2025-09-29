---
title: Runtime Security Overview
sidebar:
  order: 7
---

UDS Core provides runtime security capabilities to monitor and protect applications during execution. Runtime security solutions detect threats and malicious behavior in real-time across containerized workloads.

## NeuVector (Deprecated)

Currently, UDS Core includes [NeuVector](https://neuvector.com/) as the default runtime security solution in the `runtime-security` package layer. NeuVector provides container runtime protection, network security monitoring, vulnerability scanning, and compliance reporting.

:::caution[Deprecation Notice]
**NeuVector will be removed from UDS Core in a future release.** We recommend transitioning to Falco and deploying it as an optional component along side Neuvector as soon as possible.
:::

## Falco

[Falco](https://falco.org/) is now available as an optional runtime security zarf component and is the recommended path forward. Falco is a CNCF graduated project that provides cloud-native runtime security and real-time threat detection.

### Deploying Falco

To deploy Falco, add it as an optional component in your UDS bundle:

```yaml
kind: UDSBundle
metadata:
  name: my-uds-bundle
  description: UDS bundle with Falco runtime security
  version: x.x.x

packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
    optionalComponents:
      - falco # Deploys Falco as an optional component
```
