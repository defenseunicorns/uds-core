---
title: Networking Configuration
---

## KubeAPI Egress

The UDS operator is responsible for dynamically updating network policies that use the `remoteGenerated: KubeAPI` custom selector, in response to changes in the Kubernetes API server’s IP address. This ensures that policies remain accurate as cluster configurations evolve. However, in environments where the API server IP(s) frequently change, this behavior can lead to unnecessary overhead or instability.

To address this, the UDS operator provides an option to configure a static CIDR range. This approach eliminates the need for continuous updates by using a predefined range of IP addresses for network policies. To configure a specific CIDR range, set an override to `cluster.networking.kubeApiCIDR` in your bundle as a value or variable. For example:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      uds-operator-config:
        uds-operator-config:
          values:
            - path: cluster.networking.kubeApiCIDR
              value: "172.0.0.0/24"
```

This configuration directs the operator to use the specified CIDR range (`172.0.0.0/24` in this case) for KubeAPI network policies instead of dynamically tracking the API server’s IP(s).

When configuring a static CIDR range, it is important to make the range as restrictive as possible to limit the potential for unexpected networking access. An overly broad range could inadvertently allow egress traffic to destinations beyond the intended scope. Additionally, careful alignment with the actual IP addresses used by the Kubernetes API server is essential. A mismatch between the specified CIDR range and the cluster's configuration can result in network policy enforcement issues or disrupted connectivity.

## KubeNodes CIDRs

The UDS operator is responsible for dynamically updating network policies that use the `remoteGenerated: KubeNodes` custom selector, in response to changes to nodes in the Kubernetes cluster. As nodes are added, updated, or removed from a cluster, the operator will ensure that policies remain accurate and include all the nodes in the cluster.

UDS operator provides an option to configure a set of static CIDR ranges in place of offering a dynamically updated list by setting an override to `cluster.networking.kubeNodeCIDRs` in your bundle as a value or variable. The value should be an array of values for the individual IP addresses, using `/32` notation. For example:

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
              value:
                - 172.28.0.2/32
                - 172.28.0.3/32
                - 172.28.0.4/32
```

## Additional Network Allowances

Applications deployed in UDS Core utilize [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/) with a "Deny by Default" configuration to ensure network traffic is restricted to only what is necessary. Some applications in UDS Core allow for overrides to accommodate environment-specific requirements.

### Prometheus Stack

The Prometheus stack in UDS Core creates the necessary Network Policies (netpols) to ensure interoperability within UDS Core. However, in certain environments, you may want to allow traffic from the Prometheus stack to reach other services (potentially outside the cluster). To facilitate this, we provide a way to configure additional netpols for the Prometheus stack.

For example, you might want to allow Alertmanager to send alerts to an external service (such as a Slack or Mattermost Webhook).

To accomplish this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.x.x-upstream
    overrides:
      kube-prometheus-stack:
        uds-prometheus-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: alertmanager
                  remoteGenerated: Anywhere
                  description: "from alertmanager to anywhere"
                  port: 443
```

The example above allows Alertmanager to send alerts to any external destination. Alternatively, you could use the remoteNamespace key to specify another namespace within the Kubernetes cluster (i.e. Mattermost).

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.

### Vector

It may also be desired to allow Vector to send logs to an external service. To facilitate this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.x.x-upstream
    overrides:
      vector:
        uds-vector-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: vector
                  remoteNamespace: elastic
                  remoteSelector:
                    app.kubernetes.io/name: elastic
                  port: 9090
                  description: "Elastic Storage"
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: vector
                  remoteGenerated: Anywhere
                  port: 80 # or 443
                  description: "S3 Storage"
```

The example above allows Vector to send logs to an Elastic instance in the elastic namespace and to an S3 storage service.

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.

### Grafana

It may be desired to connect Grafana to additional datasources in or outside of the cluster. To facilitate this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.x.x-upstream
    overrides:
      grafana:
        uds-grafana-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: grafana
                  remoteNamespace: thanos
                  remoteSelector:
                    app.kubernetes.io/name: thanos
                  port: 9090
                  description: "Thanos Query"
```

The example above allows Grafana to query a remote Thanos instance in your cluster.

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.

### Falco

It may be desired send alerts from falco to locations in or outside of the cluster. To facilitate this, you can provide this [bundle override](/reference/configuration/runtime-security/alerting/#external-alert-forwarding) send alerts to any external destination. Alternatively, you could use the remoteNamespace key to specify another namespace within the Kubernetes cluster (i.e. Mattermost).

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.

### Keycloak

You may have a need to connect Keycloak to an external IdP or other service that the default network policies do not support. To facilitate this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.x.x-upstream
    overrides:
      keycloak:
        keycloak:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: keycloak
                  remoteCidr: 72.123.123.123
                  description: "IdP Connection"
                  port: 443
```

The example above allows Keycloak to connect to an "external IdP" at a specific remoteCidr.

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.

### Loki

You may have a need to configure Loki with egress to an additional destination, such as for [external caching](https://grafana.com/docs/loki/latest/operations/caching/) connections. To facilitate this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.x.x-upstream
    overrides:
      loki:
        uds-loki-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: loki
                  remoteCidr: 72.123.123.123
                  description: "Cache Connection"
                  port: 6379
```

The example above allows Loki to connect to an "external cache" at a specific remoteCidr.

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.
