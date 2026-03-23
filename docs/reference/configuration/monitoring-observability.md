---
title: Monitoring & Observability
sidebar:
  order: 5
---

UDS Core's monitoring stack exposes configuration surfaces for uptime probes, recording rules, and Grafana dashboards. This page documents the defaults, available metrics, and bundle variables that control monitoring behavior.

## Grafana dashboards

UDS Core adds two uptime-focused dashboards to Grafana alongside its component dashboards:

| Dashboard                           | Description                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **UDS / Monitoring / Core Uptime**  | Availability status, uptime percentage, and component status timeline for UDS Core infrastructure components      |
| **UDS / Monitoring / Probe Uptime** | Probe uptime status timeline, percentage uptime, and TLS certificate expiration dates for all monitored endpoints |

## Default uptime probes

UDS Core includes endpoint probes for core services out of the box. These are configured in the Package CR's `expose` entries and create Prometheus [Probes](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.Probe) automatically.

| Service          | Gateway | Monitored paths                                     | Probe name                  |
| ---------------- | ------- | --------------------------------------------------- | --------------------------- |
| Keycloak (SSO)   | tenant  | `/`, `/realms/uds/.well-known/openid-configuration` | `uds-sso-tenant-uptime`     |
| Keycloak (admin) | admin   | `/`                                                 | `uds-keycloak-admin-uptime` |
| Grafana          | admin   | `/healthz`                                          | `uds-grafana-admin-uptime`  |

### Disabling default probes

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

## Probe metrics

Endpoint probes produce standard Blackbox Exporter metrics:

| Metric                           | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `probe_success`                  | Whether the probe succeeded (1) or failed (0) |
| `probe_duration_seconds`         | Total probe duration                          |
| `probe_http_status_code`         | HTTP response status code                     |
| `probe_ssl_earliest_cert_expiry` | SSL certificate expiration timestamp          |

## Recording rules

UDS Core ships Prometheus recording rules that track the availability of core infrastructure components. These produce `uds:<component>:up` metrics (1 = available, 0 = unavailable) and require no user configuration. Rules are organized by layer:

- **base** — Istiod, Istio CNI, ztunnel, admin and tenant ingress gateways, Pepr admission and watcher
- **monitoring** — Prometheus, Alertmanager, Blackbox Exporter, Kube State Metrics, Prometheus Operator, Node Exporter, Grafana, Grafana endpoint (probe-derived)
- **logging** — Loki backend, write, read, and gateway, Vector
- **identity-authorization** — Keycloak, Keycloak Waypoint, Authservice, Keycloak SSO endpoint (probe-derived), Keycloak admin endpoint (probe-derived)
- **runtime-security** — Falco, Falcosidekick
- **backup-restore** — Velero
- **core** — `uds:access:up`, the overall access health indicator derived from `uds:keycloak_endpoint:up` (probe-derived)

> [!NOTE]
> Rules marked "probe-derived" depend on `probe_success` metrics from the default uptime probes. If probes are disabled, these rules will produce no data.

## Related documentation

- [Monitoring & Observability concepts](/concepts/core-features/monitoring-observability/) — high-level overview of the monitoring stack
- [Set up uptime monitoring](/how-to-guides/monitoring-observability/set-up-uptime-monitoring/) — configure uptime probes for your own applications
- [Monitoring How-to Guides](/how-to-guides/monitoring-observability/overview/) — task-oriented monitoring guides
