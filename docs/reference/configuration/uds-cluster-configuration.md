---
title: Configuring Cluster Level Data
---

To set and control certain cluster level configurations, UDS uses a combination of a [UDS ClusterConfig](/reference/configuration/custom-resources/clusterconfig-v1alpha1-cr.md) and Kubernetes secret, both deployed as templates from the `uds-operator-config` chart.

## Values

```yaml
operator:
  AUTHSERVICE_REDIS_URI: "###ZARF_VAR_AUTHSERVICE_REDIS_URI###"
  # Allow Pepr watch to be configurable to react to dropped connections faster
  PEPR_LAST_SEEN_LIMIT_SECONDS: "300"
  # Allow Pepr to re-list resources more frequently to avoid missing resources
  PEPR_RELIST_INTERVAL_SECONDS: "600"
  # Configure Pepr reconcile strategy to have separate queues for faster reconciliation
  PEPR_RECONCILE_STRATEGY: "kindNsName"

cluster:
  attributes:
    clusterName: ""
    clusterTags: []
  expose:
    # Domain configuration (admin defaults to `admin.UDS_DOMAIN`)
    domain: "###ZARF_VAR_DOMAIN###"
    adminDomain: "###ZARF_VAR_ADMIN_DOMAIN###"
    caCert: "###ZARF_VAR_CA_CERT###"
  policy:
    allowAllNsExemptions: "###ZARF_VAR_ALLOW_ALL_NS_EXEMPTIONS###"
  networking:
    kubeApiCIDR: ""
    kubeNodeCIDRs: []
```

> Note
:::note
Many of the values under `operator` are deprecated and will be removed. Please use `cluster` going forward.
:::

## Setting Values

Some configurations, like `clusterName`, `clusterTags`, `kubeApiCIDR`, and `kubeNodeCIDRs`, can only be set by bundle overrides. All other values can be set either by bundle overrides or by setting the corresponding Zarf variable.

## Examples

uds-config.yaml:

```yaml
options:
  # options here

shared:
  DOMAIN: "my.domain"
  ALLOW_ALL_NS_EXEMPTIONS: "true"

variables:
  core:
    CLUSTER_NAME: "my-uds-cluster"
```

uds-cli:  
`uds deploy my-uds-bundle.tar.zst --set CLUSTER_NAME="my-cluster" --confirm`

bundle overrides:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      uds-operator-config:
        uds-operator-config:
          values:
            - path: cluster.networking.kubeNodeCIDRs
              value: |
                - 172.28.0.2/32
                - 172.28.0.3/32
                - 172.28.0.4/32
```
