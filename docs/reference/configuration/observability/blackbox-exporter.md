---
title: Blackbox Exporter
sidebar:
    order: 4.5
---

UDS Core includes an optional Prometheus Blackbox Exporter component for uptime monitoring and endpoint probing.

## Overview

The Blackbox Exporter enables HTTP/HTTPS probing of external endpoints and services to monitor uptime and availability. It's deployed as an optional component within the UDS Core monitoring stack.

## Bundle Configuration

Blackbox Exporter is included by default in the standard UDS Core bundle. To use it, include the monitoring package in your bundle:

```yaml
kind: UDSBundle
metadata:
  name: example-bundle-with-blackbox
  description: An example bundle including blackbox-exporter
  version: "0.1.0"

packages:
  - name: core-base
    repository: ghcr.io/defenseunicorns/packages/uds/core-base
    ref: 0.59.0-upstream
  - name: core-monitoring
    repository: ghcr.io/defenseunicorns/packages/uds/core-monitoring
    ref: 0.59.0-upstream
```

:::note
Blackbox Exporter is deployed as an optional component within the monitoring package. It will be automatically included when using the standard UDS Core bundles.
:::

## Deployment

### Standard Bundle

Deploy the standard UDS Core bundle which includes Blackbox Exporter:

```bash
uds deploy bundles/k3d-standard/uds-bundle-k3d-core-demo-amd64-0.59.0.tar.zst --confirm
```

### Custom Bundle

For custom deployments, ensure the monitoring package is included in your bundle configuration.

## What to Expect

### After Deployment

Once deployed, you'll see:

- **Pod**: `blackbox-exporter-*` pod running in the `monitoring` namespace
- **Service**: `blackbox-exporter` service on port 9115
- **ServiceMonitor**: Automatic Prometheus metrics collection
- **Network Policies**: Configured egress for external probing

### Default Configuration

The Blackbox Exporter comes pre-configured with an `http_2xx` module:

- **Protocol**: HTTP
- **Timeout**: 5 seconds
- **Valid HTTP versions**: HTTP/1.1, HTTP/2.0
- **Method**: GET
- **Redirects**: Follow redirects automatically

### Prometheus Integration

Blackbox Exporter automatically integrates with Prometheus:

- **Metrics endpoint**: `http://blackbox-exporter:9115/metrics`
- **Discovery**: Prometheus automatically discovers and scrapes metrics
- **Targets**: Available in the Prometheus UI under targets

## Usage

### Manual Probing

For testing and debugging, you can manually probe endpoints:

```bash
# Port forward to access Blackbox Exporter
kubectl port-forward -n monitoring svc/blackbox-exporter 9115:9115

# Probe an HTTP endpoint
curl "http://localhost:9115/probe?target=https://example.com&module=http_2xx"

# Check current configuration
curl http://localhost:9115/config
```

### Monitoring Targets

The Blackbox Exporter provides metrics for:

- **Probe success/failure rates**
- **Response times**
- **SSL certificate expiration**
- **HTTP status codes**

## Configuration

### Default Module

The default `http_2xx` module handles basic HTTP probing:

```yaml
http_2xx:
  prober: http
  timeout: 5s
  http:
    valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
    method: GET
    follow_redirects: true
```

### Custom Configuration

For advanced use cases, you can customize the probing configuration through UDS Core bundle overrides or future Pepr-based configuration management.

## Security Considerations

- **Network Policies**: Configured to allow external probing while maintaining security
- **Security Contexts**: Runs with minimal privileges and non-root user
- **Resource Limits**: Configured to prevent resource exhaustion
- **TLS Verification**: Probes verify SSL certificates by default
