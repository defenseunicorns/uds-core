---
title: Monitoring and Metrics
---

UDS Core deploys Prometheus and Grafana to provide metrics collection and dashboarding. Out of the box all applications in UDS Core will have their metrics collected by Prometheus, with some default dashboards present in Grafana for viewing this data. This document primarily focuses on the integrations and options provided for extending this to monitor any additional applications you would like to deploy.

## Capturing Metrics

There are a few options within UDS Core to collect metrics from your application. Since the prometheus operator is deployed we recommend using the `ServiceMonitor` and/or `PodMonitor` custom resources to capture metrics. These resources are commonly supported in application helm charts and should be used if available. UDS Core also supports generating these resources from the `monitor` list in the `Package` spec, since charts do not always support monitors. This also provides a simplified way for other users to create monitors, similar to the way `VirtualServices` are generated with the `Package` CR. A full example of this can be seen below:

```yaml
...
spec:
  monitor:
    # Example Service Monitor
    - selector: # Selector for the service to monitor
        app: foobar
      portName: metrics # Name of the port to monitor
      targetPort: 1234 # Corresponding target port on the pod/container (for network policy)
      # Optional properties depending on your application
      description: "Metrics" # Add to customize the service monitor name
      kind: ServiceMonitor # optional, kind defaults to service monitor if not specified. PodMonitor is the other valid option.
      podSelector: # Add if pod labels are different than `selector` (for network policy)
        app: barfoo
      path: "/mymetrics" # Add if metrics are exposed on a different path than "/metrics"
      authorization: # Add if authorization is required for the metrics endpoint
        credentials:
          key: "example-key"
          name: "example-secret"
          optional: false
        type: "Bearer"
    # Example Pod Monitor
    - portName: metrics # Name of the port on the pod to monitor
      targetPort: 1234 # Corresponding target port on the pod/container (for network policy)
      selector: # Selector for pod(s) to monitor; note: pod monitors support `podSelector` as well, both options behave the same
        app: barfoo
      kind: PodMonitor
      # Optional properties depending on your application
      description: "Metrics" # Add to customize the pod monitor name
      path: "/mymetrics" # Add if metrics are exposed on a different path than "/metrics"
      authorization: # Add if authorization is required for the metrics endpoint
        credentials:
          key: "example-key"
          name: "example-secret"
          optional: false
        type: "Bearer"
```

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
