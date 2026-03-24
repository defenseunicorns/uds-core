---
title: Loki storage
sidebar:
  order: 3.003
---

UDS Core configures Loki's storage backend, bucket names, and schema versioning through the `loki` Helm chart. Bundle operators can override these fields to connect Loki to external object storage and control schema migration timing.

## Schema configuration

The `loki.schemaConfig.configs` field controls how Loki indexes and stores log data across schema versions. UDS Core ships two schema entries: a `boltdb-shipper` `v12` entry for backward compatibility and a `tsdb` `v13` entry for new data.

UDS Core calculates the `tsdb` `from` date automatically based on the deployment scenario:

| Scenario                                | `tsdb` `from` date                 | Effect                                                                                                    |
| --------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Fresh install (no existing Loki secret) | 48 hours before deployment         | All data uses `tsdb` `v13` from the start                                                                 |
| Upgrade without existing `tsdb` config  | 48 hours after deployment          | Existing data stays on `boltdb-shipper` `v12`; new data transitions to `tsdb` `v13` after the date passes |
| Upgrade with existing `tsdb` config     | Preserves the existing `from` date | No change to schema timing                                                                                |

> [!NOTE]
> UDS Core calculates these dates automatically using Helm template logic. Most operators do not need to override `schemaConfig`.

Operators who need deterministic, reproducible dates (for example, to pin schema transitions across environments) can override `schemaConfig.configs` directly. The following example sets explicit dates for both schema entries:

```yaml title="uds-bundle.yaml"
overrides:
  loki:
    loki:
      values:
        - path: loki.schemaConfig.configs
          value:
            # Legacy schema entry, making sure to include any previous dates you used
            - from: 2022-01-11
              store: boltdb-shipper
              object_store: "{{ .Values.loki.storage.type }}"
              schema: v12
              index:
                prefix: loki_index_
                period: 24h
            # New tsdb schema, set the from date in the future for your planned migration window
            - from: 2026-03-27
              store: tsdb
              object_store: "{{ .Values.loki.storage.type }}"
              schema: v13
              index:
                prefix: loki_index_
                period: 24h
```

> [!CAUTION]
> Overriding `schemaConfig.configs` bypasses UDS Core's automatic date management. When overriding, keep these constraints in mind:
>
> - Schema entries must be listed in chronological order by `from` date, with the latest entry last.
> - Never remove an old schema entry. Loki uses each entry to read data written during that period; removing one makes that data unreadable.
> - Loki interprets `from` dates as UTC midnight. If you set a "future" date that has already passed in UTC (for example, due to timezone differences), data written between UTC midnight and the time you apply the config can become unreadable.
> - You are responsible for setting correct `from` dates that align with your deployment timeline. An incorrect date can cause Loki to fail to start or lose access to existing log data.

## Storage backend

The `loki.storage` fields control the object storage type, endpoint, credentials, and bucket names that Loki uses for chunk and index data.

| Field                              | Type    | Default                                               | Description                                                                                              |
| ---------------------------------- | ------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `loki.storage.type`                | string  | `"s3"`                                                | Storage backend type (for example, `s3`, `gcs`, `azure`)                                                 |
| `loki.storage.bucketNames.chunks`  | string  | `"uds"`                                               | Bucket name for log chunk data                                                                           |
| `loki.storage.bucketNames.admin`   | string  | `"uds"`                                               | Bucket name for administrative data                                                                      |
| `loki.storage.s3.endpoint`         | string  | `"http://minio.uds-dev-stack.svc.cluster.local:9000"` | S3-compatible endpoint URL                                                                               |
| `loki.storage.s3.accessKeyId`      | string  | `"uds"`                                               | Access key ID for S3 authentication                                                                      |
| `loki.storage.s3.secretAccessKey`  | string  | `"uds-secret"`                                        | Secret access key for S3 authentication                                                                  |
| `loki.storage.s3.s3ForcePathStyle` | boolean | `true`                                                | Use path-style URLs instead of virtual-hosted-style; required for MinIO and most S3-compatible providers |
| `loki.storage.s3.insecure`         | boolean | `false`                                               | Allow HTTP (non-TLS) connections to the storage endpoint                                                 |
| `loki.storage.s3.region`           | string  | —                                                     | AWS region for the S3 bucket; required for AWS S3, not needed for MinIO                                  |

> [!NOTE]
> The defaults target the internal MinIO dev stack deployed by `uds-dev-stack`. Production deployments must override the endpoint, credentials, and bucket names to point to external object storage. UDS Core does not set a default for `bucketNames.ruler`, but the Loki chart templates reference this field for ruler storage configuration. If you use Loki's ruler with external object storage, you may need to set `loki.storage.bucketNames.ruler` to a valid bucket name.

The following example shows a minimal production override for S3-compatible storage:

```yaml title="uds-bundle.yaml"
overrides:
  loki:
    loki:
      values:
        # Storage backend type
        - path: loki.storage.type
          value: "s3"
        # Set endpoint for MinIO or other S3-compatible providers (omit for AWS S3)
        # - path: loki.storage.s3.endpoint
        #   value: "https://minio.example.com"
        # Set to false for AWS S3; keep true for MinIO / S3-compatible providers
        # - path: loki.storage.s3.s3ForcePathStyle
        #   value: false
      variables:
        # Object storage bucket for log chunks
        - name: LOKI_CHUNKS_BUCKET
          path: loki.storage.bucketNames.chunks
        # Object storage bucket for admin data
        - name: LOKI_ADMIN_BUCKET
          path: loki.storage.bucketNames.admin
        # AWS region (required for AWS S3)
        - name: LOKI_S3_REGION
          path: loki.storage.s3.region
        # S3 access key ID
        - name: LOKI_S3_ACCESS_KEY_ID
          path: loki.storage.s3.accessKeyId
          sensitive: true
        # S3 secret access key
        - name: LOKI_S3_SECRET_ACCESS_KEY
          path: loki.storage.s3.secretAccessKey
          sensitive: true
```

## Additional configuration

Operators may need to adjust query and replication settings depending on log volume and cluster topology.

| Field                                                      | Type    | Default          | Description                                                                                          |
| ---------------------------------------------------------- | ------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `deploymentMode`                                           | string  | `SimpleScalable` | Loki deployment architecture; alternatives are `SingleBinary` and `Distributed`                      |
| `loki.commonConfig.replication_factor`                     | integer | `1`              | Number of replicas for each log chunk; increase for data durability in production                    |
| `loki.limits_config.split_queries_by_interval`             | string  | `"30m"`          | Time interval used to split large queries into smaller sub-queries                                   |
| `loki.limits_config.allow_structured_metadata`             | boolean | `false`          | Enable structured metadata on log lines; requires schema `v13` or later                              |
| `loki.query_scheduler.max_outstanding_requests_per_tenant` | integer | `32000`          | Maximum queued queries per tenant before Loki rejects new requests                                   |
| `read.replicas`                                            | integer | `3`              | Number of read-tier replicas; inherited from upstream chart, not set by UDS Core                     |
| `write.replicas`                                           | integer | `3`              | Number of write-tier replicas; inherited from upstream chart, not set by UDS Core                    |
| `backend.replicas`                                         | integer | `3`              | Number of backend-tier replicas; inherited from upstream chart, not set by UDS Core                  |

UDS Core does not override the upstream chart defaults for replica counts. For guidance on tuning replicas and resources for production workloads, see [Configure high-availability logging](/how-to-guides/high-availability/logging/). For compactor and retention settings, see [Configure log retention](/how-to-guides/logging/configure-log-retention/).

## Related documentation

- [Configure high-availability logging](/how-to-guides/high-availability/logging/) - tune replica counts and resources for production
- [Configure log retention](/how-to-guides/logging/configure-log-retention/) - set compactor and retention policies
- [Logging](/concepts/core-features/logging/) - how Vector, Loki, and Grafana work together in UDS Core
- [Grafana Loki schema configuration](https://grafana.com/docs/loki/latest/operations/storage/schema/#changing-the-schema) - upstream docs on schema versioning and migration rules
- [Grafana Loki configuration reference](https://grafana.com/docs/loki/latest/configure/) - upstream Loki configuration documentation
