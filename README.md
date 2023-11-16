# Unicorn Delivery Service - Core (UDS Core)

> [!WARNING]  
> UDS Core is in early alpha and is not ready for general use.

UDS Core groups foundational Unicorn Delivery Service applications that are heavily influenced [Big Bang](https://repo1.dso.mil/big-bang/bigbang).

The core applications are:

- [Authservice](https://github.com/istio-ecosystem/authservice) - Authorization
- [Grafana](https://grafana.com/oss/grafana/) - Monitoring
- [Istio](https://istio.io/) - Service Mesh
- [KeyCloak](https://www.keycloak.org/) - Identity & Access Management
- [Kiali](https://kiali.io/) - Service Mesh Observability
- [Kyverno](https://kyverno.io/) - Policy Engine
- [Loki](https://grafana.com/oss/loki/) - Log Aggregation
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server) - Metrics
- [Neuvector](https://open-docs.neuvector.com/) - Container Security
- [Prometheus Stack](https://github.com/prometheus-operator/kube-prometheus) - Monitoring
- [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/) - Log Aggregation
- [Tempo](https://grafana.com/docs/tempo/latest/getting-started/) - Tracing
- [Velero](https://velero.io/) - Backup & Restore

## Prerequisites

<!-- table -->

| Dependency                                                     | Minimum Version |
| -------------------------------------------------------------- | --------------- |
| [Zarf](https://github.com/defenseunicorns/zarf/releases)       | 0.31.1          |
| [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) | 0.3.0           |
| [NodeJS](https://nodejs.org/en/download/)                      | LTS or Current  |

<!-- endtable -->

## Users

### Quickstart

A common need is bootrapping a new UDS Core environment for development or testing. The command below will deploy a local K3d cluster with UDS Core on a Mac M1. See the remaining sections for more details if the different bundles & packages available.

```bash
uds deploy oci://ghcr.io/defenseunicorns/packages/uds/bundles/k3d-core:0.1.3-arm64
```

The bundle includes the uds.dev certs by default. To use custom certs, you can set the appropriate env variables and run

```bash
npx ts-node bundles/tls-certs.ts
```

### UDS Core Packages

UDS core publishes two packages:

- [core](./packages/standard/README.md): The standard UDS Core package that is a collection of individual packages that are deployed as a single unit.

- [core-istio](./packages/istio/README.md): The UDS Core Istio package that only deploys Istio.

### UDS Core Bundles

Thes bundles are intended for boostrapping common development & testing environments and should not be used for produciton. They also serve as examples to create custom bundles.

- [k3d-core](./bundles/k3d-core/README.md): A bundle to create a local k3d cluster with UDS Core installed.

- [k3d-core-istio](./bundles/k3d-core-istio/README.md): A bundle to create a local k3d cluster with only Istio from UDS Core installed.

## Development: Create, build, and test the UDS Core Package

For complete testing, we test against a UDS Bundle that uses a locally-built Zarf package. Manually testing against the packages found under `/packages` is also possible using the `zarf` command.

```bash
uds run -f tasks/test.yaml uds-core
```

## Working with an individual package

The individual packages that make up UDS Core are broken down in `src/`, the commands below can be used to work with them individually in development.

#### Create, build, and test a single package (e.g. Neuvector)

```bash
UDS_PKG=neuvector uds run -f tasks/test.yaml single-package
```

#### To build a single package (e.g. Neuvector)

```bash
UDS_PKG=neuvector uds run -f tasks/create.yaml single-package
```

#### To deploy a single built package (e.g. Neuvector)

```bash
UDS_PKG=neuvector uds run -f tasks/deploy.yaml single-package
```

#### To test a single package (e.g. Neuvector)

```bash
uds run -f src/neuvector/tasks/validate.yaml run
```
