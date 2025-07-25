---
title: Configuring Policy Exemptions
---

By default policy exemptions ([UDSExemptions](https://github.com/defenseunicorns/uds-core/blob/uds-docs/src/pepr/operator/crd/generated/exemption-v1alpha1.ts)) are only allowed in a single namespace -- `uds-policy-exemptions`. We recognize this is not a conventional pattern in K8s, but believe it is ideal for UDS for the following reasons:

- highlights the fact that an exemption can reduce the overall security posture of the cluster
- makes maintaining RBAC for controlling exemptions more straightforward
- reduces the risk that an unintentional mis-configuration of RBAC allows a cluster exemption that would otherwise be denied

## Allow All Namespaces

If you believe that the default scoping is not the right approach for your cluster, you can configure UDS-CORE at deploy time to allow exemption CRs in all namespaces.

CLI set: `zarf package deploy zarf-package-uds-core-*.zst --set ALLOW_ALL_NS_EXEMPTIONS=true`

Or via a uds bundle `uds-config.yaml` file:

```yaml
variables:
  core:
    ALLOW_ALL_NS_EXEMPTIONS: "true"
```

or via bundle overrides:

```yaml
packages:
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      uds-operator-config:
        uds-operator-config:
          values:
            - path: cluster.policy.allowAllNsExemptions
              value: true
```
