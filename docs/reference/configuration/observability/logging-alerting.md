---
title: Log Based Alerting
sidebar:
    order: 4.5
---

UDS Core deploys Loki with log alerting and metrics recording capabilities enabled through the Loki Ruler. This allows you to create alerts based on log patterns and generate metrics from logs using recording rules. The Loki Ruler evaluates LogQL expressions and can send alerts to Alertmanager and recording rule metrics to Prometheus.

## Log Alerting and Recording Rules

Log-based alerting in UDS Core provides two main capabilities:

1. [Loki Alerting Rules](https://grafana.com/docs/loki/latest/alert/#alerting-rules): Generate alerts when specific log patterns are detected
2. [Loki Recording Rules](https://grafana.com/docs/loki/latest/alert/#recording-rules): Create metrics from log queries for better performance and to enable metric-based alerting

The Loki Ruler component evaluates these rules and integrates with the existing monitoring stack:
- **Alerts** -> Sent to Alertmanager
- **Recording Rules** -> Metrics sent to Prometheus for storage and further alerting

## Architecture Flow

- Applications send logs to Loki
- Loki Ruler (a part of the Loki backend pods) evaluates rules against log data
- Alerting rules trigger notifications via Alertmanager
  - Alerts are routed through notification channels
- Recording rules create metrics stored in Prometheus
  - Metrics are available for dashboards and further alerting

## Deploying Rules

Rules are deployed using Kubernetes ConfigMaps or Secrets with specific labels that Loki's sidecar watches for. The sidecar automatically loads any ConfigMaps/Secrets labeled with `loki_rule: "1"`.

### Rule File Structure

Rules must be in YAML format following the [Loki ruler configuration](https://grafana.com/docs/loki/latest/alert/) specification:

```yaml
groups:
  - name: example-group
    rules:
      - alert: HighErrorRate
        expr: |
          rate({app="my-app"} |= "ERROR" [5m]) > 0.1
        for: 5m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors per second"
      
      - record: my_app:error_rate
        expr: |
          rate({app="my-app"} |= "ERROR" [5m])
```

### Deploying Alerting Rules

Create a ConfigMap with your alerting rules. Here's an example that monitors error rates and application logs availability:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-alert-rules
  namespace: my-app-namespace
  labels:
    loki_rule: "1"  # Required label for Loki sidecar to pick up
data:
  rules.yaml: |
    groups:
      - name: my-app-alerts
        rules:
          - alert: ApplicationErrors
            expr: |
              sum(rate({namespace="my-app-namespace"} |= "ERROR" [5m])) > 0.05
            for: 2m
            labels:
              severity: warning
              service: my-app
            annotations:
              summary: "High error rate for my-app"
              runbook_url: "https://wiki.company.com/runbooks/my-app-errors"
          
          - alert: ApplicationLogsDown
            expr: |
              absent_over_time({namespace="my-app-namespace",app="my-app"}[5m])
            for: 1m
            labels:
              severity: critical
              service: my-app
            annotations:
              summary: "Application is not producing logs"
              description: "No logs received from application for 5 minutes"
```

### Deploying Recording Rules

Recording rules create metrics from log queries which can be used to enable more performative metric-based alerting:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-recording-rules
  namespace: my-app-namespace
  labels:
    loki_rule: "1"
data:
  recording-rules.yaml: |
    groups:
      - name: my-app-metrics
        interval: 30s  # How often to evaluate the rules
        rules:
          - record: my_app:request_rate # name of the metric produced in prometheus
            expr: |
              sum(rate({namespace="my-app-namespace",app="my-app"} |= "REQUEST" [1m]))
          
          - record: my_app:error_rate
            expr: |
              sum(rate({namespace="my-app-namespace",app="my-app"} |= "ERROR" [1m]))
          
          - record: my_app:error_percentage
            expr: |
              (
                sum(rate({namespace="my-app-namespace",app="my-app"} |= "ERROR" [1m]))
                /
                sum(rate({namespace="my-app-namespace",app="my-app"} [1m]))
              ) * 100
```

You can then create Prometheus alerting rules based on these recorded metrics using a [PrometheusRule CRD](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.PrometheusRule) (these rules will automatically be sent to Alertmanager):

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-prometheus-alerts
  namespace: my-app-namespace
  labels:
    prometheus: kube-prometheus-stack-prometheus
spec:
  groups:
    - name: my-app-prometheus-alerts
      rules:
        - alert: HighErrorPercentage
          expr: my_app:error_percentage > 5
          for: 5m
          labels:
            severity: warning
            service: my-app
          annotations:
            description: "High error rate on my-app"
            runbook_url: "https://wiki.company.com/runbooks/my-app-high-errors"
```

## Best Practices

### Rule Organization
- Group related rules together using meaningful group names
- Use consistent labeling across rules for better organization
- Include runbook URLs in alert annotations for operational guidance

### Performance Considerations
- Use recording rules for complex or frequently-evaluated queries
- Set appropriate evaluation intervals (default: 1m, adjust based on needs)
- Be mindful of cardinality when creating recorded metrics

### Alert Quality
- Set appropriate `for` durations to reduce noise
- Include meaningful labels for routing and filtering
- Provide actionable descriptions and summary annotations
- Test alerts before deploying to production

## Integration with Existing Monitoring

Recording rules from Loki create metrics that integrate seamlessly with existing Prometheus-based monitoring:

1. **Grafana Dashboards**: Use recorded metrics in dashboards alongside other Prometheus metrics
2. **Prometheus Alerts**: Create traditional metric-based alerts using recorded metrics
3. **Alertmanager**: All alerts (direct from Loki and Prometheus-based) route through the same Alertmanager instance in UDS Core

This approach provides a unified monitoring experience while leveraging the power of log-based analysis.
