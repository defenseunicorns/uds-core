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
| [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) | 0.10.x          |
| [NodeJS](https://nodejs.org/en/download/)                      | LTS or Current  |

<!-- endtable -->

## Create, build, and test UDS Core Package

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
