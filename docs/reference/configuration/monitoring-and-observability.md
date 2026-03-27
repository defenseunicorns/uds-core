---
title: Monitoring & Observability
sidebar:
  order: 3.002
---

UDS Core's monitoring stack exposes configuration surfaces at two levels: built-in platform monitoring that works out of the box, and application-level uptime probes that operators configure through the `Package` CR.

## Built-in monitoring

### Grafana dashboards

UDS Core adds two uptime-focused dashboards to Grafana alongside its component dashboards:

| Dashboard                           | Description                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **UDS / Monitoring / Core Uptime**  | Availability status, uptime percentage, and component status timeline for UDS Core infrastructure components      |
| **UDS / Monitoring / Probe Uptime** | Probe uptime status timeline, percentage uptime, and TLS certificate expiration dates for all monitored endpoints |

### Default uptime probes

UDS Core includes endpoint probes for core services out of the box. These create Prometheus [Probes](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.Probe) automatically.

| Service          | Gateway | Monitored paths                                     | Probe name                  |
| ---------------- | ------- | --------------------------------------------------- | --------------------------- |
| Keycloak (SSO)   | tenant  | `/`, `/realms/uds/.well-known/openid-configuration` | `uds-sso-tenant-uptime`     |
| Keycloak (admin) | admin   | `/`                                                 | `uds-keycloak-admin-uptime` |
| Grafana          | admin   | `/healthz`                                          | `uds-grafana-admin-uptime`  |

#### Disabling default probes

Each service has an `uptime.enabled` Helm value (boolean, default: `true`) that controls whether its default probes are created.

To disable probes for Keycloak and Grafana, add a value override in your bundle:

```yaml title="uds-bundle.yaml"
overrides:
  keycloak:
    keycloak:
      values:
        - path: uptime.enabled
          value: false
  grafana:
    uds-grafana-config:
      values:
        - path: uptime.enabled
          value: false
```

> [!NOTE]
> Disabling default uptime probes removes the underlying `probe_success` metrics that the built-in dashboards rely on. The Probe Uptime dashboard will show no data for disabled services, and the Core Uptime dashboard will show gaps for probe-derived components such as `keycloak-sso-endpoint`, `keycloak-admin-endpoint`, and `core-access`.

### Recording rules

UDS Core ships Prometheus recording rules that track the availability of core infrastructure components. These produce `uds:<component>:up` metrics (1 = available, 0 = unavailable) and require no user configuration. Rules are organized by layer:

- **base**: Istiod, Istio CNI, ztunnel, admin and tenant ingress gateways, Pepr admission and watcher
- **monitoring**: Prometheus, Alertmanager, Blackbox Exporter, Kube State Metrics, Prometheus Operator, Node Exporter, Grafana, Grafana endpoint (probe-derived)
- **logging**: Loki backend, write, read, and gateway, Vector
- **identity-authorization**: Keycloak, Keycloak Waypoint, Authservice, Keycloak SSO endpoint (probe-derived), Keycloak admin endpoint (probe-derived)
- **runtime-security**: Falco, Falcosidekick
- **backup-restore**: Velero
- **core**: `uds:access:up`, the overall access health indicator derived from `uds:keycloak_endpoint:up` (probe-derived)

> [!NOTE]
> Rules marked "probe-derived" depend on `probe_success` metrics from the default uptime probes. If probes are disabled, these rules will produce no data.

### Probe metrics

All endpoint probes (both built-in and application) produce standard Blackbox Exporter metrics:

| Metric                           | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `probe_success`                  | Whether the probe succeeded (1) or failed (0) |
| `probe_duration_seconds`         | Total probe duration                          |
| `probe_http_status_code`         | HTTP response status code                     |
| `probe_ssl_earliest_cert_expiry` | SSL certificate expiration timestamp          |

## Default probe alert rules

UDS Core ships opinionated probe alert rules in the `uds-prometheus-config` chart. These rules cover endpoint downtime and TLS certificate expiry for any series emitted by Blackbox Exporter probes, including built-in Core probes and application probes you configure through the `Package` CR.

### Shipped rules

The following rules are enabled by default:

| Rule | Default `for` | Default threshold | Default severity | Description |
|---|---|---|---|---|
| `UDSProbeEndpointDown` | `5m` | `probe_success == 0` | `warning` | Fires when a probe reports endpoint failure for longer than the configured duration |
| `UDSProbeTLSExpiryWarning` | `10m` | certificate expires in less than `30` days | `warning` | Fires when a healthy probe reports a TLS certificate nearing expiry |
| `UDSProbeTLSExpiryCritical` | `10m` | certificate expires in less than `14` days | `critical` | Fires when a healthy probe reports a TLS certificate nearing critical expiry |

All three rules preserve probe labels from the source series, such as `instance` and `job`. UDS Core also adds the following labels to support routing and filtering:

| Label | Value | Description |
|---|---|---|
| `severity` | value-specific | Alertmanager routing severity set by the matching `udsCoreDefaultAlerts.*.severity` field |
| `source` | `blackbox` | Identifies the alert as originating from Blackbox Exporter probe data |
| `category` | `probe` | Identifies the alert as a probe-focused alert rule |

> [!NOTE]
> The TLS expiry rules only evaluate for healthy probes. UDS Core joins the TLS expiry expression with `probe_success == 1`, so an unreachable endpoint does not trigger a false TLS expiry alert.

### Configuration surface

Use the following Helm values to tune or disable the built-in probe alert rules:

> [!NOTE]
> All field paths in the table below are relative to `udsCoreDefaultAlerts`.

| Field | Type | Default | Description |
|---|---|---|---|
| `.enabled` | boolean | `true` | Enables or disables the full UDS Core default probe alert ruleset |
| `.probeEndpointDown.enabled` | boolean | `true` | Enables or disables the `UDSProbeEndpointDown` rule |
| `.probeEndpointDown.for` | string | `5m` | Sets how long `probe_success == 0` must remain true before `UDSProbeEndpointDown` fires |
| `.probeEndpointDown.severity` | string | `warning` | Sets the `severity` label for `UDSProbeEndpointDown` |
| `.probeTLSExpiryWarning.enabled` | boolean | `true` | Enables or disables the `UDSProbeTLSExpiryWarning` rule |
| `.probeTLSExpiryWarning.for` | string | `10m` | Sets how long the TLS warning condition must remain true before `UDSProbeTLSExpiryWarning` fires |
| `.probeTLSExpiryWarning.days` | integer | `30` | Sets the warning threshold, in days before certificate expiry |
| `.probeTLSExpiryWarning.severity` | string | `warning` | Sets the `severity` label for `UDSProbeTLSExpiryWarning` |
| `.probeTLSExpiryCritical.enabled` | boolean | `true` | Enables or disables the `UDSProbeTLSExpiryCritical` rule |
| `.probeTLSExpiryCritical.for` | string | `10m` | Sets how long the TLS critical condition must remain true before `UDSProbeTLSExpiryCritical` fires |
| `.probeTLSExpiryCritical.days` | integer | `14` | Sets the critical threshold, in days before certificate expiry |
| `.probeTLSExpiryCritical.severity` | string | `critical` | Sets the `severity` label for `UDSProbeTLSExpiryCritical` |

The following snippet shows several examples of how the default probe alert settings can be modified:

```yaml title="uds-bundle.yaml"
overrides:
  kube-prometheus-stack:
    uds-prometheus-config:
      values:
        # Disable all UDS Core default probe alerts
        - path: udsCoreDefaultAlerts.enabled
          value: false
        # Disable only the endpoint-down alert
        - path: udsCoreDefaultAlerts.probeEndpointDown.enabled
          value: false
        # Adjust TLS warning threshold and severity
        - path: udsCoreDefaultAlerts.probeTLSExpiryWarning.days
          value: 21
        - path: udsCoreDefaultAlerts.probeTLSExpiryWarning.severity
          value: warning
        # Adjust TLS critical threshold and severity
        - path: udsCoreDefaultAlerts.probeTLSExpiryCritical.days
          value: 7
        - path: udsCoreDefaultAlerts.probeTLSExpiryCritical.severity
          value: critical
```

## Application uptime probes

Applications configure uptime monitoring through the `uptime` block on `expose` entries in the Package CR. The UDS Operator creates Prometheus Probe resources and configures Blackbox Exporter automatically. For step-by-step setup, see [Set up uptime monitoring](/how-to-guides/monitoring-and-observability/set-up-uptime-monitoring/).

## Related documentation

- [Monitoring & Observability concepts](/concepts/core-features/monitoring-observability/): high-level overview of the monitoring stack
- [Set up uptime monitoring](/how-to-guides/monitoring-and-observability/set-up-uptime-monitoring/): configure application uptime probes
- [Capture application metrics](/how-to-guides/monitoring-and-observability/capture-application-metrics/): expose metrics from your application for Prometheus scraping
- [Create metric alerting rules](/how-to-guides/monitoring-and-observability/create-metric-alerting-rules/): define custom `PrometheusRule` alerts and tune built-in defaults
- [Create log-based alerting and recording rules](/how-to-guides/monitoring-and-observability/create-log-based-alerting-and-recording-rules/): configure Loki Ruler alerts and recording rules
- [Route alerts to notification channels](/how-to-guides/monitoring-and-observability/route-alerts-to-notification-channels/): configure Alertmanager receivers and routing
- [Add custom dashboards](/how-to-guides/monitoring-and-observability/add-custom-dashboards/): deploy Grafana dashboards alongside your application
- [Add Grafana datasources](/how-to-guides/monitoring-and-observability/add-grafana-datasources/): connect additional data sources to Grafana
