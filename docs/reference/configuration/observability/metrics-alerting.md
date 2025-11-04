---
title: Metrics Alerting
sidebar:
    order: 4.4
---

UDS Core deploys Prometheus with alerting capabilities enabled through the Prometheus Operator. This allows you to create alerts based on metrics collected from your applications and infrastructure using [PrometheusRule](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.PrometheusRule) custom resources and these alerts will automatically be routed to Alertmanager.

## Default Alert Rules

By default UDS Core ships with a set of default Alerting rules from the upstream [kube-prometheus-stack chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack). You can find documentation/runbooks for these rules [here](https://runbooks.prometheus-operator.dev/).

These default rules are a great starting point for monitoring the health of your Kubernetes cluster and the components of UDS Core. However, you will likely want to create custom alerting rules specific to your applications and use cases.

### Disabling Default Alert Rules

If you want to disable the default alerting rules provided by kube-prometheus-stack, you can do so by setting the following override in your UDS bundle:

```yaml
packages:
  - name: uds-core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      kube-prometheus-stack:
        kube-prometheus-stack:
          values:
            # Disable specific individual rules by name
            - path: defaultRules.disabled
              value:
                KubeControllerManagerDown: true
                KubeSchedulerDown: true
            # Disable entire rule groups with boolean toggles
            - path: defaultRules.rules.kubeControllerManager
              value: false
            - path: defaultRules.rules.kubeSchedulerAlerting
              value: false
```
This example shows both approaches: disabling individual rules (`KubeControllerManagerDown` and `KubeSchedulerDown`) and disabling entire rule groups (`kubeControllerManager` and `kubeSchedulerAlerting`). Use individual rule disabling for fine-tuned control and rule group disabling for broader changes.

## Creating Custom Alert Rules

Create custom alerts using `PrometheusRule` CRs. These CRs are dynamically managed and loaded by the Prometheus Operator. All `PrometheusRule` alerts will be routed to Alertmanager. It is recommended to check these CRs into version control to declaratively manage your alerting rules.

### Example PrometheusRule

This is an example `PrometheusRule` that creates two alerts: one for pods that are restarting frequently and another for high memory usage in containers. When these alerts are triggered, they will be sent to Alertmanager and grouped under the `my-app` alert group.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-alerts
  namespace: my-app
spec:
  groups:
  - name: my-app
    rules:
    - alert: PodRestartingFrequently
      expr: increase(kube_pod_container_status_restarts_total[1h]) > 5
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Pod {{ $labels.pod }} is restarting frequently"
        runbook: "https://example.com/runbooks/pod-restart"
        description: "Pod restarted {{ $value }} times in the last hour"

    - alert: HighMemoryUsage
      expr: |
        (container_memory_working_set_bytes / container_spec_memory_limit_bytes) * 100 > 80
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage detected"
        runbook: "https://example.com/runbooks/high-memory-usage"
        description: "Container using {{ $value }}% of memory limit"
```

### Best Practices

Some common best practices when creating PrometheusRule Alerts:

- Deploy `PrometheusRule` CRs in same namespace as your application
- Ship `PrometheusRule` CRs with your application if possible
- Use meaningful labels like `severity` to categorize alerts
- Add `for` clauses to prevent alert flapping
- Include annotations like `summary`, `description`, and `runbook` for context and to make alerts actionable

You can find more information on best practices for alerting from Prometheus [here](https://prometheus.io/docs/practices/alerting/).
