---
title: Uptime Monitoring with Blackbox Exporter
sidebar:
    order: 4.5
---

## Overview

UDS Core includes Blackbox Exporter for HTTP/HTTPS probing of endpoints to monitor uptime and availability. Uptime checks can be configured through the UDS Package CR, and Prometheus [Probes](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.Probe) resources are automatically created based on your configuration.

## Uptime Monitoring

To enable uptime monitoring for an exposed service, configure the `uptime.checks` section within your Package CR's `expose` entries.

:::note
Uptime checks for Authservice-protected applications are fully supported. The UDS Operator automatically creates a dedicated Keycloak service account client for each Authservice-protected expose entry and configures the Blackbox Exporter with OAuth2 client credentials, allowing probes to authenticate and reach the application directly.
:::

### Basic Example

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-app
spec:
  network:
    expose:
      # monitors: https://myapp.uds.dev/
      - service: my-app
        host: myapp
        gateway: tenant
        port: 8080
        uptime:
          checks:
            paths:
              - /
```

This creates a Prometheus Probe that monitors `https://myapp.uds.dev/` using the default `http_2xx` module, which issues HTTP GET requests at a regular interval and checks for a successful (2xx) response.

### Custom Paths

Monitor specific health endpoints:

```yaml
spec:
  network:
    expose:
      # monitors: https://myapp.uds.dev/health and https://myapp.uds.dev/ready
      - service: my-app
        host: myapp
        gateway: tenant
        port: 8080
        uptime:
          checks:
            paths:
              - /health
              - /ready
```

### Multiple Endpoints

Monitor multiple services in a single package:

```yaml
spec:
  network:
    expose:
      # monitors: https://app.uds.dev/healthz, https://api.uds.dev/health, https://api.uds.dev/ready, https://app.admin.uds.dev/
      - service: frontend
        host: app
        gateway: tenant
        port: 3000
        uptime:
          checks:
            paths:
              - /healthz
      - service: api
        host: api
        gateway: tenant
        port: 8080
        uptime:
          checks:
            paths:
              - /health
              - /ready
      - service: admin
        host: app
        gateway: admin
        port: 8080
        uptime:
          checks:
            paths:
              - /
```

### Authservice-Protected Applications

For applications protected by Authservice, add `uptime.checks` to the expose entry as normal. The UDS Operator detects the `enableAuthserviceSelector` on the matching SSO entry and automatically:

1. Creates a Keycloak service account client (`<clientId>-probe`) with an audience mapper scoped to the application's SSO client
2. Configures the Blackbox Exporter with an OAuth2 module that obtains a token via client credentials before probing

No additional configuration is required beyond adding `uptime.checks.paths`:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-app
spec:
  sso:
    - name: My App
      clientId: uds-my-app
      redirectUris:
        - "https://myapp.uds.dev/login"
      enableAuthserviceSelector:
        app: my-app
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
```

The operator matches the expose entry to the SSO entry via the redirect URI origin (`https://myapp.uds.dev`) and configures the probe to authenticate transparently through Authservice.

### Multiple Expose Entries for Same FQDN

Uptime monitoring is opt-in by defining `uptime.checks.paths`. If you have multiple expose entries for the same FQDN, only one can have uptime checks configured:

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
              - /
      - service: my-app
        host: myapp
        gateway: tenant
        port: 8443
        description: secondary-port
        # no uptime configuration (not monitored)
```

## Metrics

The Blackbox Exporter provides some of the following key metrics (not exhaustive) that can be used for alerting and dashboarding:

| Metric | Description |
|--------|-------------|
| `probe_success` | Whether the probe succeeded (1) or failed (0) |
| `probe_duration_seconds` | Total probe duration |
| `probe_http_status_code` | HTTP response status code |
| `probe_ssl_earliest_cert_expiry` | SSL certificate expiration timestamp |

### Example Queries

```promql
# Check all probes and their success status
probe_success

# Check if a specific endpoint is up
probe_success{instance="https://myapp.uds.dev/health"}
```

## Grafana Dashboard

UDS Core includes an uptime monitoring dashboard that displays:

- Uptime status timeline for all monitored endpoints
- Percentage uptime over the selected time period
- TLS certificate expiration dates

Access it via Grafana under **UDS / Monitoring / Uptime**.
