---
title: Monitoring & Observability
sidebar:
  order: 5.000
---

UDS Core's monitoring stack exposes configuration surfaces at two levels: built-in platform monitoring that works out of the box, and application-level uptime probes that operators configure through the Package CR.

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

To disable probes in your bundle, add a value override:

```yaml
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

## Application uptime probes

Applications configure uptime monitoring through the `uptime` block on `expose` entries in the Package CR. The UDS Operator creates Prometheus Probe resources and configures Blackbox Exporter automatically. For step-by-step setup, see [Set up uptime monitoring](/how-to-guides/monitoring-and-observability/set-up-uptime-monitoring/).

### Package CR schema

The `uptime` block is nested under each `spec.network.expose[]` entry:

| Field | Type | Required | Description |
|---|---|---|---|
| `uptime` | object | no | Uptime monitoring configuration for this exposed service. Presence of `checks.paths` enables monitoring. |
| `uptime.checks` | object | no | HTTP probe checks configuration for Blackbox Exporter. |
| `uptime.checks.paths` | string[] | yes (if `checks` is set) | List of URL paths to probe, appended to the host FQDN. Minimum 1 item. |

```yaml
spec:
  network:
    expose:
      - service: my-app
        host: myapp
        gateway: tenant
        port: 8080
        uptime:
          checks:
            paths:
              - /healthz
              - /ready
```

### Constraints

- **One probe per FQDN**: only one `expose` entry per FQDN can have `uptime.checks` configured. The operator rejects the Package CR if duplicate FQDNs have uptime checks.
- **Authservice-protected apps**: the operator automatically creates a Keycloak service account client and configures OAuth2 authentication for probes on Authservice-protected endpoints. No additional configuration is needed.

> [!NOTE]
> The UDS Operator fully manages the Blackbox Exporter configuration via the `uds-prometheus-blackbox-config` secret in the `monitoring` namespace. Probe modules are generated automatically; do not manually edit this secret.

## Related documentation

- [Monitoring & Observability concepts](/concepts/core-features/monitoring-observability/): high-level overview of the monitoring stack
- [Set up uptime monitoring](/how-to-guides/monitoring-and-observability/set-up-uptime-monitoring/): configure application uptime probes
- [Capture application metrics](/how-to-guides/monitoring-and-observability/capture-application-metrics/): expose metrics from your application for Prometheus scraping
- [Create metric alerting rules](/how-to-guides/monitoring-and-observability/create-metric-alerting-rules/): define PrometheusRule alerts for probe and application metrics
- [Create log-based alerting and recording rules](/how-to-guides/monitoring-and-observability/create-log-based-alerting-and-recording-rules/): configure Loki Ruler alerts and recording rules
- [Route alerts to notification channels](/how-to-guides/monitoring-and-observability/route-alerts-to-notification-channels/): configure Alertmanager receivers and routing
- [Add custom dashboards](/how-to-guides/monitoring-and-observability/add-custom-dashboards/): deploy Grafana dashboards alongside your application
- [Add Grafana datasources](/how-to-guides/monitoring-and-observability/add-grafana-datasources/): connect additional data sources to Grafana
