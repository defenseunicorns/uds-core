---
title: Managing Loki Storage Upgrades and Overrides
---

When deploying or upgrading Loki, it is crucial to handle storage configuration properly to ensure smooth data continuity and prevent data loss. This document outlines why the logic for setting the schema date (`from`) is necessary, how to manage upgrades, and how to override the default behavior if required.

## Why This Logic Is Necessary
Loki stores index data based on a schema configuration that defines when a particular storage type (`store`) starts being used. When migrating to or upgrading within a new storage type, careful handling of the `from` date ensures that data is not mistakenly indexed using an incorrect schema.

There are three primary scenarios that this logic addresses:

1. New Installation (Fresh Deployments)
   - If no existing secret is found (i.e., a fresh Loki installation), the system should default to a past date (`now - 48h`).
   - This prevents data from being indexed incorrectly if time synchronization issues exist.

2. Upgrading Loki (Secret Exists but No New Storage Configuration)
   - If the secret exists but does **not** include the new storage type configuration, this is treated as an upgrade.
   - To prevent indexing issues, the `from` date should default to a future date (`now + 48h`), allowing time to transition without data loss.

3. Existing Storage Configuration Found
   - If an existing storage configuration is already defined, the system should use its `from` date to maintain continuity.

This approach ensures that both new and upgrading installations transition smoothly without manual intervention.

## Managing Upgrades
When upgrading Loki with an existing deployment, follow these best practices to ensure a seamless transition:

1. Check Existing Configuration
   - Retrieve the existing Loki `Secret` using:
     ```sh
     kubectl get secret loki -n loki -o yaml
     ```
   - Check if `config.yaml` exists and whether `schema_config.configs` contains an entry for the intended storage type.
   - We recommend saving a copy of the the current schema config list, in the case of problems this can be used with overrides.

2. Automatic Upgrade Handling
   - The upgrade logic will automatically update the schema configuration to include the latest storage type and version.
   - If you want to opt out of automatic upgrades, you will need to manually override the configuration and maintain separate values from the default settings.

## Overriding the Default Behavior
In some cases, you may want to **disable a specific storage type** or manually override the schema configuration. To do so, use bundle overrides to do this:

```yaml
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      loki:
        loki:
          values:
            # Setting this value will override the default auto-lookup behavior
            - path: loki.schemaConfig.configs
              value:
                # Self-manage configs here, making sure to include any previous dates you used
                - from: 2022-01-11
                  store: boltdb-shipper
                  object_store: "{{ .Values.loki.storage.type }}"
                  schema: v12
                  index:
                    prefix: loki_index_
                    period: 24h
                # Example: Explicitly set a date for TSDB and the v13 schema, making sure this is in the future
                - from: 2025-03-25
                  store: tsdb
                  object_store: "{{ .Values.loki.storage.type }}"
                  schema: v13
                  index:
                    prefix: loki_index_
                    period: 24h
```

It is important to ensure that the from date is set in the future, accounting for time zones, to avoid potential indexing issues. Additionally, schema configurations must be listed in sequential order, with the latest configuration appearing last to ensure proper data indexing.

For more details on changing the schema, refer to the official Loki documentation: [Changing the Schema](https://grafana.com/docs/loki/latest/operations/storage/schema/#changing-the-schema)
