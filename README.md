# Unicorn Delivery Service - Core (UDS Core)

> [!WARNING]  
> UDS Core is in early alpha and is not ready for general use.

UDS Core groups foundational Unicorn Delivery Service applications inspired by [Big Bang](https://repo1.dso.mil/big-bang/bigbang).

The core applications are:

- [Authservice](https://github.com/istio-ecosystem/authservice) - Authorization
- [Grafana](https://grafana.com/oss/grafana/) - Monitoring
- [Istio](https://istio.io/) - Service Mesh
- [KeyCloak](https://www.keycloak.org/) - Identity & Access Management
- [Kiali](https://kiali.io/) - Service Mesh Observability
- [Loki](https://grafana.com/oss/loki/) - Log Aggregation
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server) - Metrics
- [Neuvector](https://open-docs.neuvector.com/) - Container Security
- [Pepr](https://pepr.dev) - UDS policy engine & operator
- [Prometheus Stack](https://github.com/prometheus-operator/kube-prometheus) - Monitoring
- [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/) - Log Aggregation
- [Tempo](https://grafana.com/docs/tempo/latest/getting-started/) - Tracing
- [Velero](https://velero.io/) - Backup & Restore

## Prerequisites

<!-- table -->

| Dependency                                                     | Minimum Version |
| -------------------------------------------------------------- | --------------- |
| [Zarf](https://github.com/defenseunicorns/zarf/releases)       | 0.32.1          |
| [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) | 0.6.2           |
| [NodeJS](https://nodejs.org/en/download/)                      | LTS or Current  |

<!-- endtable -->

## Users

### Quickstart

A common need is bootstrapping a new UDS Core environment for development or testing. The commands below will deploy the latest version of UDS Core. See the remaining sections for more details on the different bundles and packages available.

```bash
# ARM version
uds deploy oci://ghcr.io/defenseunicorns/packages/uds/bundles/k3d-core-demo:arm64

# AMD version
uds deploy oci://ghcr.io/defenseunicorns/packages/uds/bundles/k3d-core-demo:amd64
```

The bundle includes the uds.dev certs by default. You can use the UDS environment variables to override the default values. E.g.

```bash
# Set environment variables with the contents of your certificate and key files (must be base64 encoded)
UDS_ADMIN_TLS_CERT=$(cat admin.crt)
UDS_ADMIN_TLS_KEY=$(cat admin.key)
UDS_TENANT_TLS_CERT=$(cat tenant.crt)
UDS_TENANT_TLS_KEY=$(cat tenant.key)

UDS_DOMAIN=example.com

uds deploy oci://ghcr.io/defenseunicorns/package/uds/bundles/k3d-core-demo:amd64
```

### UDS Core Package

UDS core publishes one package:

- [core](./packages/standard/README.md): The standard UDS Core package that is a collection of individual packages that are deployed as a single unit.

### UDS Core Bundles

These bundles are intended for bootstrapping common development & testing environments and should not be used for production. They also serve as examples to create custom bundles.

- [k3d-core-demo](./bundles/k3d-standard/README.md): A bundle to create a local k3d cluster with UDS Core installed.

- [k3d-core-istio-dev](./bundles/k3d-istio/README.md): A bundle to create a local k3d cluster with only Istio from UDS Core installed.

## Development: Create, build, and test the UDS Core Package

For complete testing, we test against a UDS Bundle that uses a locally-built Zarf package. Manually testing against the packages found under `/packages` is also possible using the `zarf` command.

#### Create, build, and test the UDS Core Package

```bash
uds run test-uds-core
```

## Working with an individual package

The individual packages that make up UDS Core are broken down in `src/`, the commands below can be used to work with them individually in development.

#### Create, build, and test a single package (e.g. Neuvector)

```bash
UDS_PKG=neuvector uds run test-single-package
```

#### To build a single package (e.g. Neuvector)

```bash
UDS_PKG=neuvector uds run create-single-package
```

#### To deploy a single built package (e.g. Neuvector)

```bash
UDS_PKG=neuvector uds run deploy-single-package
```

#### To test a single package already deployed (e.g. Neuvector)

```bash
uds run -f src/neuvector/tasks/validate.yaml run
```

Note: The run tasks above default to targetting the upstream (oss) package flavor.
In order to run any of the above commands against the registry1 flavor the command must be updated with ```--set FLAVOR=registry1``` For example:

```bash
uds run test-uds-core --set FLAVOR=registry1
```
