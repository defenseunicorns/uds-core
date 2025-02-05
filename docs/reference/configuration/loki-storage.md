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

2. Automatic Upgrade Handling
   - The upgrade logic will automatically update the schema configuration to include the latest storage type and version.
   - If you want to opt out of automatic upgrades, you will need to manually override the configuration and maintain separate values from the default settings.

## Overriding the Default Behavior
In some cases, you may want to **disable a specific storage type** or manually override the schema configuration. To do so, remove the automated upgrade portion of the values.yaml:

```yaml
      - from: "{{- $secret := lookup \"v1\" \"Secret\" \"loki\" \"loki\" -}}
          {{- $pastDate := now | dateModify \"-48h\" | date \"2006-01-02\" -}}
          {{- $futureDate := now | dateModify \"+48h\" | date \"2006-01-02\" -}}
          {{- $result := $pastDate -}}
          {{- if $secret -}}
            {{- $result = $futureDate -}}
            {{- if (index $secret.data \"config.yaml\") -}}
              {{- $configYAML := (index $secret.data \"config.yaml\" | b64dec | fromYaml) -}}
              {{- range $configYAML.schema_config.configs -}}
                {{- if and (eq .store \"tsdb\") (eq .schema \"v13\") -}}
                  {{- $result = .from -}}
                  {{- break -}}
                {{- end -}}
              {{- end -}}
            {{- end -}}
          {{- end -}}
          {{- $result -}}"
        store: tsdb
        object_store: "{{ .Values.loki.storage.type }}"
        schema: v13
        index:
          prefix: loki_index_
          period: 24h
```

### Forcing an Upgrade with Immediate Schema Change
If you want to transition immediately to a new storage type without waiting for the automatic 48-hour logic, modify the Helm chart values by explicitly setting the schema configuration in `values.yaml`.
