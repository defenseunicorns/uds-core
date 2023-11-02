# uds-core monorepo

The UDS Core Bundle groups foundational Unicorn Delivery Service applications that are heavily influence by PlatformOne's [Big Bang](https://repo1.dso.mil/big-bang/bigbang).

The core applications are:

- [ ] Authservice
- [ ] Grafana
- [ ] Istio
- [ ] KeyCloak
- [ ] Kiali
- [ ] Kyverno
- [ ] Loki
- [ ] Metrics Server
- [ ] Neuvector
- [ ] Prometheus
- [ ] Promtail
- [ ] Tempo
- [ ] Velero

## Prerequisites

<!-- table -->

| Dependency                                                     | Minimum Version |
| -------------------------------------------------------------- | --------------- |
| [Zarf](https://github.com/defenseunicorns/zarf/releases)       | 0.31.x          |
| [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) | 0.7.x           |
| [NodeJS](https://nodejs.org/en/download/)                      | LTS or Current  |

<!-- endtable -->

## Create, Build, Test uds-core Package

1. Make sure you have uds-cli version v0.0.8-alpha or later and nodejs
2. run ```uds run uds-core``` from the repo's root

## Working with an individual Capability

### To run full build, deploy, test of a Capability

1. cd into the zarf-runner directory of the capability you would like to test (e.g. ```capabilities/istio/.github/zarf-runner```)
2. run ```zarf p c --confirm```

### To Build a Capability

1. cd into the zarf-runner/bob-the-builder directory of the capability you would like to test (e.g. ```capabilities/istio/.github/zarf-runner/bob-the-builder```)
2. run ```zarf p c --confirm```

### To Deploy a Capability

1. cd into the zarf-runner/deploy directory of the capability you would like to test (e.g. ```capabilities/istio/.github/zarf-runner/deploy```)
2. run ```zarf p c --confirm```

### To Test a Capability

1. cd into the zarf-runner/test directory of the capability you would like to test (e.g. ```capabilities/istio/.github/zarf-runner/test```)
2. run ```zarf p c --confirm```

## Create 

[Steps used to build the UDS Bundle]

## Deploy

[Steps used to deploy the UDS Bundle]

## Remove

[Steps used to remove the UDS Bundle]
