---
title: Resource Configuration and High Availability
---

Depending on your environment and the scale of your cluster, you might need to adjust UDS Core components for high availability or to optimize resources. Below are common areas where resource overrides can be useful when deploying UDS Core.

When modifying resources and replica counts it can be useful to observe pod resource metrics in Grafana to make an informed choice on what may be necessary for your environment. Where available HPA ([Horizontal Pod Autoscalers](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)) are beneficial to dynamically scale up/down based on usage.

## Monitoring

### Prometheus Stack

Prometheus is a common place to customize when scaling to larger cluster sizes (more nodes and/or workloads). To scale prometheus beyond a single replica its TSDB must be externalized using one of the [supported options](https://prometheus.io/docs/operating/integrations/#remote-endpoints-and-storage). UDS Core has not yet done extensive testing on this setup. It is also helpful to modify resources for Prometheus using a helm override for the `prometheus.prometheusSpec.resources` value:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      kube-prometheus-stack:
        kube-prometheus-stack:
          values:
            - path: prometheus.prometheusSpec.resources
              value:
                # Example values only
                requests:
                  cpu: 200m
                  memory: 1Gi
                limits:
                  cpu: 500m
                  memory: 4Gi
```

### Grafana

Grafana can be configured in a high availability (HA) setup by utilizing an external PostgreSQL database. See the example values below for configuring Grafana in HA mode:

```yaml
# Example HA Bundle Configuration
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      grafana:
        grafana:
          variables:
            - name: GRAFANA_HA
              description: Enable HA Grafana
              path: autoscaling.enabled
        uds-grafana-config:
          variables:
            - name: GRAFANA_PG_HOST
              description: Grafana postgresql host
              path: postgresql.host
            - name: GRAFANA_PG_PORT
              description: Grafana postgresql port
              path: postgresql.port
            - name: GRAFANA_PG_PORT
              description: Grafana postgresql port
              path: postgresql.port
            - name: GRAFANA_PG_DATABASE
              description: Grafana postgresql database
              path: postgresql.database
            - name: GRAFANA_PG_PASSWORD
              description: Grafana postgresql password
              path: postgresql.password
            - name: GRAFANA_PG_USER
              description: Grafana postgresql username
              path: postgresql.user
```

## Logging

### Vector

By default Vector runs as a daemonset, automatically scaling across all nodes to ensure logs are captured from each host. Typically Vector does not need any other modifications, but you can customize its resource configuration by overriding the `resources` helm value (using the component and chart name of `vector`). Vector recommends the below resourcing when running in production:

```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "500m"
  limits:
    memory: "1024Mi"
    cpu: "6000m"
```

### Loki

By default Loki will deploy in a multi-replica setup. See the below example for modifying replica counts of the read/write/backend pods:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      loki:
        loki:
          values:
            - name: LOKI_WRITE_REPLICAS
              path: write.replicas
              default: "3"
            - name: LOKI_READ_REPLICAS
              path: read.replicas
              default: "3"
            - name: LOKI_BACKEND_REPLICAS
              path: backend.replicas
              default: "3"
```

You will also want to connect Loki to an [external storage provider](https://grafana.com/docs/loki/latest/configure/storage/#chunk-storage) such as AWS S3, which can be done by overriding the `loki.storage` values.

## Identity & Authorization

### Keycloak

Keycloak can be configured in an HA setup provided all Keycloak instances share the same database instance (PostgreSQL). Below are key points to consider when planning and operating Keycloak in HA mode:

- All Keycloak instances must connect to the same PostgreSQL database.
- HA works with two or more Keycloak instances; start with at least 2 replicas for redundancy and scale out as needed.
- For non-airgap installations, deploying across multiple availability zones is recommended to improve resilience and reduce the blast radius of zonal failures.
- Multi-Region (bridging multiple clusters/regions) is not supported by UDS.
- For additional guidance, see the Keycloak Horizontal Scaling documentation: https://www.keycloak.org/getting-started/getting-started-scaling-and-tuning#_horizontal_scaling

See the below example values for configuring HA Keycloak:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            - path: devMode
              value: false
            # Enable HPA to autoscale Keycloak
            - path: autoscaling.enabled
              value: true
          variables:
            - name: KEYCLOAK_DB_HOST
              path: postgresql.host
            - name: KEYCLOAK_DB_USERNAME
              path: postgresql.username
            - name: KEYCLOAK_DB_DATABASE
              path: postgresql.database
            - name: KEYCLOAK_DB_PASSWORD
              path: postgresql.password
```

:::caution
Scaling Keycloak down rapidly by modifying the replica count directly in the StatefulSet is not recommended and may result in data loss. This is a [known Keycloak limitation](https://github.com/keycloak/keycloak/issues/44620).
:::

Alternatively, you can configure the postgres `username`, `password`, and `host` using references to pre-existing secrets. This is useful if you are using shared secrets for the database credentials or external secrets from another source.

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            - path: devMode
              value: false
            # Enable HPA to autoscale Keycloak
            - path: autoscaling.enabled
              value: true
          variables:
            - name: KEYCLOAK_DB_HOST_SECRETREF_NAME
              path: postgresql.secretRef.host.name
            - name: KEYCLOAK_DB_HOST_SECRETREF_KEY
              path: postgresql.secretRef.host.key
            - name: KEYCLOAK_DB_USERNAME_SECRETREF_NAME
              path: postgresql.secretRef.username.name
            - name: KEYCLOAK_DB_USERNAME_SECRETREF_KEY
              path: postgresql.secretRef.username.key
            - name: KEYCLOAK_DB_DATABASE
              path: postgresql.database
            - name: KEYCLOAK_DB_PASSWORD_SECRETREF_NAME
              path: postgresql.secretRef.password.name
            - name: KEYCLOAK_DB_PASSWORD_SECRETREF_KEY
              path: postgresql.secretRef.password.key
```

:::note
When using secret references, you may use a mixture of both secret references and direct values for `username`, `password`, and `host`. The `database` and `port` values are configured using direct values.
:::

When running Keycloak on new Kernels 6.12+, it may be necessary to override Keycloak Environment Variables and set `JAVA_OPTS_KC_HEAP` to `-XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50 -XX:MaxRAM=1G`. This happens due to a fact that Java doesn't properly recognize the amount of memory allocated by the CGroups. By specifying `-XX:MaxRAM` equal to the memory limits, this setting gets overridden. Here's an example:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            # Override Java memory settings
            - path: env[0]
              value:
                - name: JAVA_OPTS_KC_HEAP
                  value: "-XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50 -XX:MaxRAM=2G"
            # Override limits - both figures need to match!
            - path: resources.limits.memory
              value: "2Gi"
```

You can also configure autoscaling for the Keycloak [waypoint](https://istio.io/latest/docs/ambient/usage/waypoint/) (its Istio Layer7 proxy). The independent scalability of the waypoint proxy ensures that you never encounter a bottleneck due to service mesh integration. An HPA is enabled by default for the waypoint, with access to the configuration parameters via values. The below override example includes the default values which could be changed based on your needs:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            - path: waypoint.horizontalPodAutoscaler.minReplicas
              value: 2
            - path: waypoint.horizontalPodAutoscaler.maxReplicas
              value: 5
            - path: waypoint.horizontalPodAutoscaler.metrics
              value:
                - type: Resource
                  resource:
                    name: cpu
                    target:
                      type: Utilization
                      averageUtilization: 90
            - path: waypoint.deployment.requests.cpu
              value: 250m
            - path: waypoint.deployment.requests.memory
              value: 256Mi
```

:::tip
For HA Keycloak deployments running on multiple nodes, it is recommended to set `waypoint.horizontalPodAutoscaler.minReplicas` to at least 2. This ensures there is no downtime when waypoint pods are restarted or rescheduled.
:::

### AuthService

AuthService can be configured in a HA setup if an [external session store](https://github.com/istio-ecosystem/authservice/blob/f8193e22db11183d0d3a9da58da39267f15c3ae0/config/README.md#authservice-config-v1-oidc-RedisConfig) is provided (key value store like Redis/Valkey). For configuring an external session store you can set the `UDS_AUTHSERVICE_REDIS_URI` env when deploying or via your `uds-config.yaml`:

```yaml
variables:
  core:
    AUTHSERVICE_REDIS_URI: redis://redis.redis.svc.cluster.local:6379
```

To scale up replicas or modify resource requests/limits you can use UDS bundle overrides for the helm values of `replicaCount` and `resources` (using the component and chart name of `authservice`).

## Runtime Security

### Falco

Falco's FalcoSidekick component runs with 2 replicas by default for high availability. This ensures alert processing continues if one replica fails. You can adjust the replica count based on your environment needs:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      falco:
        falco:
          values:
            - path: falcosidekick.replicaCount
              value: 3  # Set replicas to 3 (default is 2)
```

For production environments, keeping the default of 2 or more replicas is recommended to ensure continuous alert processing and delivery to your logging/monitoring systems.
