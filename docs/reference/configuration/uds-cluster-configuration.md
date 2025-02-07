---
title: Configuring Cluster Level Data
---

To set and control certain cluster level configurations, UDS uses a combination of a [UDS ClusterConfig](/reference/configuration/custom-resources/clusterconfig-v1alpha1-cr.md) and Kubernetes secret, both deployed as templates from the `uds-operator-config` chart.

## Values

```yaml
operator:
  ### DEPRECATED: This section is deprecated and will be removed in a future release. ###
  # Domain configuration (admin defaults to `admin.UDS_DOMAIN`)
  UDS_DOMAIN: "###ZARF_VAR_DOMAIN###"
  UDS_ADMIN_DOMAIN: "###ZARF_VAR_ADMIN_DOMAIN###"
  UDS_CA_CERT: "###ZARF_VAR_CA_CERT###"
  UDS_ALLOW_ALL_NS_EXEMPTIONS: "###ZARF_VAR_ALLOW_ALL_NS_EXEMPTIONS###"
  UDS_LOG_LEVEL: "###ZARF_VAR_UDS_LOG_LEVEL###"
  KUBEAPI_CIDR: ""
  KUBENODE_CIDRS: ""
  ### END DEPRECATED ###
  AUTHSERVICE_REDIS_URI: "###ZARF_VAR_AUTHSERVICE_REDIS_URI###"
  # Allow Pepr watch to be configurable to react to dropped connections faster
  PEPR_LAST_SEEN_LIMIT_SECONDS: "300"
  # Allow Pepr to re-list resources more frequently to avoid missing resources
  PEPR_RELIST_INTERVAL_SECONDS: "600"
  # Configure Pepr reconcile strategy to have separate queues for faster reconciliation
  PEPR_RECONCILE_STRATEGY: "kindNsName"

cluster:
  attributes:
    UDS_CLUSTER_NAME: "###ZARF_VAR_CLUSTER_NAME###" # Friendly alias for associating cluster
    UDS_CLUSTER_TAGS: "###ZARF_VAR_CLUSTER_TAGS###" # tags for helpful grouping of clusters
  expose:
    # Domain configuration (admin defaults to `admin.UDS_DOMAIN`)
    UDS_DOMAIN: "###ZARF_VAR_DOMAIN###"
    UDS_ADMIN_DOMAIN: "###ZARF_VAR_ADMIN_DOMAIN###"
    UDS_CA_CERT: "###ZARF_VAR_CA_CERT###"
  policy:
    UDS_ALLOW_ALL_NS_EXEMPTIONS: "###ZARF_VAR_ALLOW_ALL_NS_EXEMPTIONS###"
  networking:
    KUBEAPI_CIDR: ""
    KUBENODE_CIDRS: []
```

> Note
> Many of the values under `operator` are deprecated and will be removed. Please use `cluster` going forward.

## Setting Values

Some configurations can only be set by bundle overrides, namely `networking.KUBEAPI_CIDR` and `networking.KUBENODE_CIDRS`. All other values can be set either by bundle overrides or by setting the corresponding Zarf variable.

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
            - path: cluster.networking.KUBENODE_CIDRS
              value: |
                172.28.0.2/32
                172.28.0.3/32
                172.28.0.4/32
```
