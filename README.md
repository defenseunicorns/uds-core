# uds-core monorepo

> [!WARNING]  
> uds-core is in early alpha and is not ready for general consumption.

The UDS Core Bundle groups foundational Unicorn Delivery Service applications that are heavily influence by PlatformOne's [Big Bang](https://repo1.dso.mil/big-bang/bigbang).

The core applications are:

- [ ] Authservice
- [ ] Grafana
- [x] Istio
- [ ] KeyCloak
- [ ] Kiali
- [ ] Kyverno
- [x] Loki
- [ ] Metrics Server
- [x] Neuvector
- [ ] Prometheus
- [ ] Promtail
- [ ] Tempo
- [ ] Velero

## Prerequisites

<!-- table -->

| Dependency                                                     | Minimum Version |
| -------------------------------------------------------------- | --------------- |
| [Zarf](https://github.com/defenseunicorns/zarf/releases)       | 0.31.x          |
| [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) | 0.1.x           |
| [NodeJS](https://nodejs.org/en/download/)                      | LTS or Current  |

<!-- endtable -->

## Users

### Quickstart

A common need is bootrapping a new UDS Core environment for development or testing. The command below will deploy a local K3d cluster with UDS Core on a Mac M1. See the remaining sections for more details if the different bundles & capabilities available.

```bash
uds deploy oci://ghcr.io/defenseunicorns/packages/uds/bundles/k3d-core:0.1.0-arm64
```

### UDS Core Capabilities

UDS core publishes two capabilities:

- [core](./packages/standard/README.md): The standard UDS Core capability that is a collection of individual capabilities that are deployed as a single unit.

- [core-istio](./packages/istio/README.md): The UDS Core Istio capability that is a collection of individual capabilities that are deployed as a single unit.

### UDS Core Bundles

Thes bundles are intended for boostrapping common development & testing environments and should not be used for produciton. They also serve as examples to create custom bundles.

- [k3d-core](./bundles/k3d-core/README.md): A bundle to create a local k3d cluster with UDS Core installed.

- [k3d-core-istio](./bundles/k3d-core-istio/README.md): A bundle to create a local k3d cluster with only Istio from UDS Core installed.

## Development: Create, build, and test UDS Core Package

For complete testing, we test against a UDS Bundle that uses a locally-built Zarf package. Manually testing against the packages found under `/packages` is also possible using the `zarf` command.

```bash
uds run -f tasks/test.yaml uds-core
```

## Working with an individual capability

### Create, build, and test a single Capability (e.g. Neuvector)

```bash
CAPABILITY=neuvector uds run -f tasks/test.yaml single-capability
```

### To build a single capability (e.g. Neuvector)

```bash
CAPABILITY=neuvector uds run -f tasks/create.yaml single-capability
```

### To deploy a single built capability (e.g. Neuvector)

```bash
CAPABILITY=neuvector uds run -f tasks/deploy.yaml single-capability
```

### To test a single capability (e.g. Neuvector)

```bash
uds run -f capabilities/neuvector/tasks/validate.yaml run
```
