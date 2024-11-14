---
title: Networking Configuration
---

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

The example above allows Alertmanager to send alerts to any external destination. Alternatively, you could use the remoteNamespace key to specify another namespace within the Kubernetes cluster.

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
