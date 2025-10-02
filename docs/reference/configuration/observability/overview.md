---
title: Observability Overview
sidebar:
    order: 4.1
---

UDS Core provides a comprehensive observability stack that includes logging, monitoring, and alerting capabilities.

## Components

- [Prometheus](https://prometheus.io/): A powerful metrics collection and alerting system that scrapes metrics from various sources and stores them in a time-series database.
- [Loki](https://grafana.com/oss/loki/): A log aggregation system designed for storing and querying logs from various sources.
- [Grafana](https://grafana.com/): A popular open-source platform for monitoring and observability that provides rich visualization capabilities for both metrics and logs.
- [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/): A component of the Prometheus ecosystem that handles alerts sent by Prometheus and manages notification channels.

## Reference Architecture

TODO: Add architecture diagram

## Best Practices

There are many ways you can configure and use the observability stack.  Here are some best practices that align with UDS Core's architecture and design principles:

- Utilize [PrometheusRule](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.PrometheusRule) CRs to define alerting rules and thresholds that are relevant to your specific use cases. These should be deployed alongside your applications to ensure that alerts are contextually relevant. See [Metrics Alerting](/reference/configuration/observability/metrics-alerting/) for more details.
- Configure Alertmanager to route alerts to appropriate notification channels such as email, Slack, or Paging Services. This ensures that the right teams are notified promptly when issues arise. See [Alert Management](/reference/configuration/observability/alert-management/) for more details.
- Utilize [Loki Ruler recording and alerting rules](https://grafana.com/docs/loki/latest/alert/#loki-alerting-and-recording-rules) to create custom log-based alerts that complement your metrics-based alerts. This can help you detect issues that may not be captured by metrics alone. See [Log Alerting](/reference/configuration/observability/logging-alerting/) for more details.
- Avoid using [Grafana Managed Alerts](https://grafana.com/docs/grafana/latest/alerting/alerting-rules/create-grafana-managed-rule/) when possible.  Evaluating alerts at source (Prometheus and Loki) is more efficient and provides better context for alerting.  Grafana Managed Alerts should be reserved for advanced use cases like trying to correlate multiple data sources.
- Use [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/) to create visualizations that provide insights into the health and performance of your applications and infrastructure. Dashboards should be tailored to the needs of different teams and stakeholders. See [Dashboards](/reference/configuration/observability/dashboards/) for more details.
- Declaratively manage all your Observability resources with GitOps practices.  Store your `PrometheusRule` CRs, Loki Rule ConfigMaps, Grafana Dashboard ConfigMaps in a version-controlled repository. This ensures that your observability configuration is consistent and reproducible across environments.
