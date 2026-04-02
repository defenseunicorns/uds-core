# Unicorn Delivery Service - Core (UDS Core)

[![Latest Release](https://img.shields.io/github/v/release/defenseunicorns/uds-core)](https://github.com/defenseunicorns/uds-core/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/defenseunicorns/uds-core/tag-and-release.yaml)](https://github.com/defenseunicorns/uds-core/tag-and-release.yaml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/uds-core/badge)](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/uds-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/10959/badge)](https://www.bestpractices.dev/projects/10959)

## [Overview](https://docs.defenseunicorns.com/core/concepts/overview/)

UDS Core establishes a secure baseline for cloud-native systems with compliance documentation and first-class support for airgap/egress-limited environments. It combines several applications into a single [Zarf](https://zarf.dev) package, deployed using [UDS CLI](https://docs.defenseunicorns.com/cli/getting-started/installation/).

Key capabilities include the [UDS Operator](https://docs.defenseunicorns.com/core/reference/operator--crds/overview/) for automated networking, SSO, and monitoring configuration, and the [UDS Policy Engine](https://docs.defenseunicorns.com/core/reference/operator--crds/policy-engine/) for security enforcement.

> [!TIP]
> For full documentation including architecture, configuration, and how-to guides, visit the [UDS Core docs](https://docs.defenseunicorns.com/core/).

### Core Applications

| Application | Role |
|---|---|
| [Istio](https://istio.io/) | Service Mesh |
| [Keycloak](https://www.keycloak.org/) | Identity & Access Management |
| [Authservice](https://github.com/istio-ecosystem/authservice) | Authorization |
| [Pepr](https://pepr.dev) | UDS Policy Engine & Operator |
| [Prometheus Stack](https://github.com/prometheus-operator/kube-prometheus) | Monitoring |
| [Grafana](https://grafana.com/oss/grafana/) | Dashboards & Visualization |
| [Blackbox Exporter](https://github.com/prometheus/blackbox_exporter) | Endpoint Probing |
| [Metrics Server](https://github.com/kubernetes-sigs/metrics-server) | Cluster Metrics |
| [Loki](https://grafana.com/oss/loki/) | Log Aggregation |
| [Vector](https://vector.dev/) | Log Collection & Routing |
| [Falco](https://falco.org/docs/) | Runtime Security |
| [Velero](https://velero.io/) | Backup & Restore |

## Getting Started

### Try it locally

Run a local demo with K3d:

```bash
uds deploy k3d-core-demo:latest
```

See the [Local Demo guide](https://docs.defenseunicorns.com/core/getting-started/local-demo/overview/) for full setup instructions.

### Deploy to production

For production deployments on any CNCF-conformant Kubernetes cluster, see the [Production Deployment guide](https://docs.defenseunicorns.com/core/getting-started/production/overview/).

### Develop & test

For developing UDS Core itself or building UDS Packages, see the [Contributing Guide](./CONTRIBUTING.md) and [dev bundles documentation](./bundles/k3d-slim-dev/README.md).
