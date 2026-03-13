---
title: Logging
sidebar:
  order: 5
---

UDS Core deploys Loki for log storage and Vector for log collection. This page documents the UDS Core-specific configuration surfaces that bundle operators can adjust. For general Loki and Vector configuration, refer to the upstream documentation linked below.

## Loki storage backend

UDS Core configures Loki with an S3-compatible object store backend by default. The storage backend connection details are set via the upstream `loki` chart.

Bundle override path: `overrides.loki.loki.values[].path: loki.storage`

| Field | Type | Default | Description |
|---|---|---|---|
| `loki.storage.type` | string | `s3` | Storage backend type |
| `loki.storage.bucketNames.chunks` | string | `uds` | Bucket name for log chunk data |
| `loki.storage.bucketNames.admin` | string | `uds` | Bucket name for Loki admin data |
| `loki.storage.s3.endpoint` | string | MinIO dev URL | S3-compatible endpoint URL |
| `loki.storage.s3.accessKeyId` | string | `uds` | S3 access key ID |
| `loki.storage.s3.secretAccessKey` | string | `uds-secret` | S3 secret access key |
| `loki.storage.s3.s3ForcePathStyle` | boolean | `true` | Use path-style S3 addressing (required for MinIO and some S3-compatible stores) |
| `loki.storage.s3.insecure` | boolean | `false` | Disable TLS for the S3 connection |

> [!NOTE]
> The default endpoint and credentials target the UDS dev stack (MinIO). Override all S3 fields for production deployments.

## Storage network egress

The `uds-loki-config` chart controls how UDS Core configures network egress for Loki's object store connection. Use this when your S3 endpoint is cluster-internal or reachable only via a known CIDR.

Bundle override path: `overrides.loki.uds-loki-config.values[].path: storage`

| Field | Type | Default | Description |
|---|---|---|---|
| `storage.internal.enabled` | boolean | `false` | Route storage traffic to an in-cluster S3-compatible service |
| `storage.internal.remoteSelector` | map | `{}` | Pod label selector for the in-cluster storage service |
| `storage.internal.remoteNamespace` | string | `""` | Namespace of the in-cluster storage service |
| `storage.egressCidr` | string | `""` | Restrict storage egress to a specific CIDR; empty allows unrestricted egress |

Example — route to an in-cluster MinIO instance:

```yaml
overrides:
  loki:
    uds-loki-config:
      values:
        - path: storage.internal.enabled
          value: true
        - path: storage.internal.remoteSelector
          value:
            app: minio
        - path: storage.internal.remoteNamespace
          value: minio
```

Example — restrict to a CIDR (e.g., internal S3-compatible service on a private network):

```yaml
overrides:
  loki:
    uds-loki-config:
      values:
        - path: storage.egressCidr
          value: "10.0.0.0/8"
```

## Dashboard annotations

UDS Core supports optional Grafana dashboard folder grouping via dashboard annotations on the Loki deployment.

Bundle override path: `overrides.loki.uds-loki-config.values[].path: dashboardAnnotations`

| Field | Type | Default | Description |
|---|---|---|---|
| `dashboardAnnotations` | map | `{}` | Map of annotation key-value pairs applied to Loki's Grafana dashboards for folder grouping |

See the [monitoring & observability how-to guides](/how-to-guides/monitoring-observability/overview/) for guidance on configuring Grafana dashboard organization.

## Additional network allow rules

The `additionalNetworkAllow` field on the `uds-loki-config` chart lets bundle operators declare extra network allow rules for the Loki namespace — for example, to allow egress to an external cache or datasource. Entries follow the same structure as Package CR `allow` entries.

Bundle override path: `overrides.loki.uds-loki-config.values[].path: additionalNetworkAllow`

```yaml
overrides:
  loki:
    uds-loki-config:
      values:
        - path: additionalNetworkAllow
          value:
            - direction: Egress
              selector:
                app.kubernetes.io/name: loki
              remoteCidr: 72.123.123.123/32
              description: "External cache"
              port: 6379
```

For the full `allow` entry schema, see [Packages CR reference — Allow](/reference/operator-and-crds/packages-v1alpha1-cr/#Allow).

## Related documentation

- [Networking & service mesh reference](/reference/networking/) — Package CR `allow` field schema used by `additionalNetworkAllow`
- [Packages CR reference](/reference/operator-and-crds/packages-v1alpha1-cr/) — full schema for network allow rules
- [Loki configuration reference](https://grafana.com/docs/loki/latest/configure/) — upstream Loki configuration documentation
- [Vector configuration reference](https://vector.dev/docs/reference/configuration/) — upstream Vector configuration documentation
