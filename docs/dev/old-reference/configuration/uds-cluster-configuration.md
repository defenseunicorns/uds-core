---
title: Configuring Cluster Level Data
---

To set and control certain cluster level configurations, UDS uses a combination of a [UDS ClusterConfig](/reference/configuration/custom-resources/clusterconfig-v1alpha1-cr) and Kubernetes secret, both deployed as templates from the `uds-operator-config` chart.

## Values

```yaml
operator:
  AUTHSERVICE_REDIS_URI: "###ZARF_VAR_AUTHSERVICE_REDIS_URI###"

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

## Setting Values

Some configurations, like `clusterName`, `clusterTags`, `kubeApiCIDR`, and `kubeNodeCIDRs`, can only be set by bundle overrides. All other values can be set either by bundle overrides or by setting the corresponding Zarf variable.

### Example Bundle Overrides

Within your bundle you can define values/variables, for example:
```yaml
packages:
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      uds-operator-config:
        uds-operator-config:
          values:
            - path: cluster.networking.kubeNodeCIDRs
              value:
                - 172.28.0.2/32
                - 172.28.0.3/32
                - 172.28.0.4/32
          variables:
            - name: CLUSTER_NAME
              path: cluster.attributes.clusterName
```

Then for any variables you have defined (or existing zarf variables) you can override these with a `uds-config.yaml` file:

```yaml
shared:
  # DOMAIN is a zarf variable that is typically shared across packages
  DOMAIN: "my.domain"

variables:
  core:
    # CLUSTER_NAME is defined as a variable in our bundle above
    CLUSTER_NAME: "my-uds-cluster"
    # ALLOW_ALL_NS_EXEMPTIONS is a zarf variable for UDS Core
    ALLOW_ALL_NS_EXEMPTIONS: "true"
```

Or variables can be set at deploy time via CLI args, such as `uds deploy my-uds-bundle.tar.zst --set CLUSTER_NAME="my-cluster" --confirm`
