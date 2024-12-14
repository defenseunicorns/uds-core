---
title: Networking Configuration
---

## KubeAPI Egress

The UDS operator is responsible for dynamically updating network policies that use the `remoteGenerated: KubeAPI` custom selector, in response to changes in the Kubernetes API server’s IP address. This ensures that policies remain accurate as cluster configurations evolve. However, in environments where the API server IP(s) frequently change, this behavior can lead to unnecessary overhead or instability.

To address this, the UDS operator provides an option to configure a static CIDR range. This approach eliminates the need for continuous updates by using a predefined range of IP addresses for network policies. To configure a specific CIDR range, set an override to `operator.KUBEAPI_CIDR` in your bundle as a value or variable. For example:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      uds-operator-config:
        uds-operator-config:
          values:
            - path: operator.KUBEAPI_CIDR
              value: "172.0.0.0/24"
```

This configuration directs the operator to use the specified CIDR range (`172.0.0.0/24` in this case) for KubeAPI network policies instead of dynamically tracking the API server’s IP(s).

When configuring a static CIDR range, it is important to make the range as restrictive as possible to limit the potential for unexpected networking access. An overly broad range could inadvertently allow egress traffic to destinations beyond the intended scope. Additionally, careful alignment with the actual IP addresses used by the Kubernetes API server is essential. A mismatch between the specified CIDR range and the cluster's configuration can result in network policy enforcement issues or disrupted connectivity.

## Additional Network Allowances

Applications deployed in UDS Core utilize [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/) with a "Deny by Default" configuration to ensure network traffic is restricted to only what is necessary. Some applications in UDS Core allow for overrides to accommodate environment-specific requirements.

### Prometheus Stack

The Prometheus stack in UDS Core creates the necessary Network Policies (netpols) to ensure interoperability within UDS Core. However, in certain environments, you may want to allow traffic from the Prometheus stack to reach other services (potentially outside the cluster). To facilitate this, we provide a way to configure additional netpols for the Prometheus stack.

For example, you might want to allow Alertmanager to send alerts to an external service (such as a Slack or Mattermost Webhook).

To accomplish this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core-monitoring
    ref: 0.31.1-upstream
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
    repository: ghcr.io/defenseunicorns/packages/uds/core-monitoring
    ref: 0.31.1-upstream
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
                  port: 80
                  description: "S3 Storage"
```

The example above allows Vector to send logs to an Elastic instance in the elastic namespace and to an S3 storage service.

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.

### Grafana

It may be desired to connect Grafana to additional datasources in or outside of the cluster. To facilitate this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core-monitoring
    ref: 0.31.1-upstream
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

### NeuVector

It may be desired send alerts from NeuVector to locations in or outside of the cluster. To facilitate this, you can provide a bundle override as follows:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core-monitoring
    ref: 0.31.1-upstream
    overrides:
      neuvector:
        uds-neuvector-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app: neuvector-manager-pod
                  remoteGenerated: Anywhere
                  description: "from neuvector to anywhere"
                  port: 443
```

The example above allows NeuVector to send alerts to any external destination. Alternatively, you could use the remoteNamespace key to specify another namespace within the Kubernetes cluster (i.e. Mattermost).

Reference the [spec for allow](https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow) for all available fields.
