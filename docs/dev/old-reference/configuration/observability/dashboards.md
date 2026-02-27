---
title: Dashboards
sidebar:
    order: 4.6
---

UDS Core ships with Grafana as the central tool for visualizing and exploring both metrics and logs.  UDS Core ships with some default dashboards like the ones provided by the [kube-prometheus-stack chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack/templates/grafana/dashboards-1.14). However, you may want to add your own dashboards to visualize application-specific metrics or logs.

## Adding Dashboards

Grafana within UDS Core is configured with [a sidecar](https://github.com/grafana/helm-charts/blob/6eecb003569dc41a494d21893b8ecb3e8a9741a0/charts/grafana/values.yaml#L926-L928) that will watch for new dashboards added via configmaps or secrets and load them into Grafana dynamically. In order to have your dashboard added the configmap or secret must be labelled with `grafana_dashboard: "1"`, which is used by the sidecar to watch and collect new dashboards.

Your configmap/secret must have a data key named `<dashboard_file_name>.json`, with a multi-line string of the dashboard json as the value. See the below example for app dashboards created this way:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-dashboards
  namespace: my-app
  labels:
    grafana_dashboard: "1"
data:
  # The value for this key should be your full JSON dashboard
  my-dashboard.json: |
    {
      "annotations": {
        "list": [
          {
            "builtIn": 1,
...
  # Helm's Files functions can also be useful if deploying in a helm chart: https://helm.sh/docs/chart_template_guide/accessing_files/
  my-dashboard-from-file.json: |
    {{ .Files.Get "dashboards/my-dashboard-from-file.json" | nindent 4 }}
```

Grafana provides helpful documentation on [how to build dashboards](https://grafana.com/docs/grafana/latest/getting-started/build-first-dashboard/) via the UI, which can then be [exported as JSON](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/#export-a-dashboard-as-json) so that they can be captured in code and loaded as shown above.

### Grouping Dashboards

Grafana supports creation of folders for dashboards to provide better organization. UDS Core does not utilize folders by default but the sidecar supports simple values configuration to dynamically create and populate folders. The example overrides below show how to set this up and place the UDS Core default dashboards into a uds-core folder:

```yaml
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      grafana:
        grafana:
          values:
            # This value allows us to specify a grafana_folder annotation to indicate the file folder to place a given dashboard into
            - path: sidecar.dashboards.folderAnnotation
              value: grafana_folder

            # This value configures the sidecar to build out folders based upon where dashboard files are
            - path: sidecar.dashboards.provider.foldersFromFilesStructure
              value: true
      kube-prometheus-stack:
        kube-prometheus-stack:
          values:
            # This value adds an annotation to the defaults dashboards to specify that they should be grouped under a `uds-core` folder
            - path: grafana.sidecar.dashboards.annotations
              value:
                grafana_folder: "uds-core"
      loki:
        uds-loki-config:
          values:
            # This value adds an annotation to the loki dashboards to specify that they should be grouped under a `uds-core` folder
            - path: dashboardAnnotations
              value:
                grafana_folder: "uds-core"
```

Dashboards deployed outside of core can then be grouped separately by adding the annotation `grafana_folder` to your configmap or secret, with a value for the folder name you want. For example:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-dashboards
  namespace: my-app
  labels:
    grafana_dashboard: "1"
  annotations:
    # The value of this annotation determines the group that your dashboard will be under
    grafana_folder: "my-app"
data:
  # Your dashboard data here
```

:::note
If using this configuration, any dashboards without a `grafana_folder` annotation will still be loaded in Grafana, but will not be grouped (they will appear at the top level outside of any folders). Also note that new dashboards in UDS Core may also need to be overridden to add the folder annotation, this example represents the current set of dashboards deployed by default.
:::

## Adding Datasources

Grafana in UDS Core is deployed with a [datasource sidecar](https://github.com/grafana/helm-charts/blob/main/charts/grafana/values.yaml#L872-L875) that watches for external datasource `ConfigMap`s or `Secret`s. This allows you to extend Grafana’s datasource configuration without modifying the default datasources deployed by UDS Core.

### Extending the Default Datasource ConfigMap

The default UDS Core deployment creates a `ConfigMap` named `grafana-datasources`, which includes built-in datasources like Prometheus, Loki, and Alertmanager. You can extend this list by providing additional datasource definitions via the `extraDatasources` value in your UDS bundle.

```yaml
overrides:
  grafana:
    uds-grafana-config:
      values:
        - path: extraDatasources
          value:
            - name: Prometheus
              type: prometheus
              access: proxy
              url: http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090
```

These entries will be injected into the existing `datasources.yaml` generated in the `grafana-datasources` ConfigMap. This keeps your configuration declarative and avoids needing to replace the whole configmap.

The datasource will appear alongside the default ones when Grafana boots, and no extra ConfigMap management is required.
