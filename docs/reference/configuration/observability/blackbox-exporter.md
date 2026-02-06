---
title: Blackbox Exporter
sidebar:
    order: 4.5
---

## Overview

The Blackbox Exporter enables HTTP/HTTPS probing of external endpoints and services to monitor uptime and availability.

## Bundle Configuration

:::note
Blackbox Exporter is deployed as an optional component within the core package. You must explicitly enable it in the `optionalComponents` section of your bundle configuration.
:::

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
    optionalComponents:
      - prometheus-blackbox-exporter
```

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
