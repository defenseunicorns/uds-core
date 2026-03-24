# Unicorn Delivery Service - Core (UDS Core)

![UDS Core](docs/.images/UDS_Core_Logo_Dark.svg)

[![Latest Release](https://img.shields.io/github/v/release/defenseunicorns/uds-core)](https://github.com/defenseunicorns/uds-core/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/defenseunicorns/uds-core/tag-and-release.yaml)](https://github.com/defenseunicorns/uds-core/tag-and-release.yaml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/uds-core/badge)](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/uds-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/10959/badge)](https://www.bestpractices.dev/projects/10959)

## [Overview](https://docs.defenseunicorns.com/core/concepts/overview/)

UDS Core establishes a secure baseline for cloud-native systems with compliance documentation and first-class support for airgap/egress-limited environments. It combines several applications into a single [Zarf](https://zarf.dev) package, deployed using [UDS CLI](https://docs.defenseunicorns.com/cli/getting-started/installation/).

Key capabilities include the [UDS Operator](https://docs.defenseunicorns.com/core/reference/operator--crds/overview/) for automated networking, SSO, and monitoring configuration, and the [UDS Policy Engine](https://docs.defenseunicorns.com/core/reference/operator--crds/policy-engine/) for security enforcement.

### Core Applications

- [Authservice](https://github.com/istio-ecosystem/authservice) - Authorization
- [Grafana](https://grafana.com/oss/grafana/) - Monitoring
- [Istio](https://istio.io/) - Service Mesh
- [KeyCloak](https://www.keycloak.org/) - Identity & Access Management
- [Loki](https://grafana.com/oss/loki/) - Log Aggregation
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server) - Metrics
- [Falco](https://falco.org/docs/) - Container Security
- [Pepr](https://pepr.dev) - UDS policy engine & operator
- [Prometheus Stack](https://github.com/prometheus-operator/kube-prometheus) - Monitoring
- [Blackbox Exporter](https://github.com/prometheus/blackbox_exporter) - Endpoint Probing
- [Vector](https://vector.dev/) - Log Aggregation
- [Velero](https://velero.io/) - Backup & Restore

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

## Architecture

<!-- @lulaStart 7d855a1f-5735-498a-95ad-f0d2fa572cb1 -->

![UDS Core Architecture Diagram](docs/.images/diagrams/uds-core-arch-overview.svg)

<!-- @lulaEnd 7d855a1f-5735-498a-95ad-f0d2fa572cb1 -->
