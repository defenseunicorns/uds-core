# Unicorn Delivery Service - Core (UDS Core)

[![Latest Release](https://img.shields.io/github/v/release/defenseunicorns/uds-core)](https://github.com/defenseunicorns/uds-core/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/defenseunicorns/uds-core/tag-and-release.yaml)](https://github.com/defenseunicorns/uds-core/tag-and-release.yaml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/uds-core/badge)](https://api.securityscorecards.dev/projects/github.com/defenseunicorns/uds-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/10959/badge)](https://www.bestpractices.dev/projects/10959)

## [UDS Core Overview](https://uds.defenseunicorns.com/reference/uds-core/overview/)

UDS Core establishes a secure baseline for cloud-native systems and ships with compliance documentation and first-class support for airgap/egress-limited systems. UDS Core provides advanced automation with the [UDS Operator](./src/pepr/operator/README.md) and [UDS Policy Engine](./src/pepr/policies/README.md). UDS Core is a collection of several individual applications combined into a single [Zarf](https://zarf.dev) package and we recommend using [UDS CLI](https://github.com/defenseunicorns/uds-cli?tab=readme-ov-file#install) to deploy it as a [UDS Bundle](#using-uds-core-in-production).

#### tl;dr - [try it now](#quickstart)

#### Core Applications

- [Authservice](https://github.com/istio-ecosystem/authservice) - Authorization
- [Grafana](https://grafana.com/oss/grafana/) - Monitoring
- [Istio](https://istio.io/) - Service Mesh
- [KeyCloak](https://www.keycloak.org/) - Identity & Access Management
- [Loki](https://grafana.com/oss/loki/) - Log Aggregation
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server) - Metrics
- [Neuvector](https://open-docs.neuvector.com/) - Container Security
- [Pepr](https://pepr.dev) - UDS policy engine & operator
- [Prometheus Stack](https://github.com/prometheus-operator/kube-prometheus) - Monitoring
- [Vector](https://vector.dev/) - Log Aggregation
- [Velero](https://velero.io/) - Backup & Restore

---

### Prerequisites

- A running container environment for K3D to interact with for dev & test environments
- [K3D](https://k3d.io/) v5.7.1 or later for dev & test environments or any [CNCF Certified Kubernetes Cluster](https://www.cncf.io/training/certification/software-conformance/#logos) for production environments.
<!-- renovate: datasource=github-tags depName=defenseunicorns/uds-cli versioning=semver -->
- [UDS CLI](https://github.com/defenseunicorns/uds-cli?tab=readme-ov-file#install): v0.20.0 or later

---

### Using UDS Core in Production

While the UDS Bundles published by this repo can be used for dev and test environments and include a K3d cluster, UDS Core also publishes a UDS Package that is intended to be used in your own UDS Bundle. You can use the [k3d-core-demo bundle](./bundles/k3d-standard/README.md) as an example.

---

### Quickstart, Dev & Test Environments

UDS Core publishes bundles you can use for trying out UDS Core or for UDS Package development where you only need part of UDS Core. These bundles leverage [UDS K3d](https://github.com/defenseunicorns/uds-k3d) to create a local k3d cluster with tools installed to emulate a cloud environment.

> [!NOTE]
> These UDS Bundles are intended for dev and test environments and should not be used for production. They also serve as examples to create custom bundles.

#### Quickstart

If you want to try out UDS Core, you can use the [k3d-core-demo bundle](./bundles/k3d-standard/README.md) to create a local k3d cluster with UDS Core installed by running the following command:

<!-- x-release-please-start-version -->

```bash
uds deploy k3d-core-demo:0.48.0
```

<!-- x-release-please-end -->

#### UDS Package Development

In addition to the demo bundle, a [k3d-slim-dev bundle](./bundles/k3d-slim-dev/README.md) also exists to work with UDS Core with only Istio, Keycloak & Pepr installed. Run the command below to use it.

Deploy Istio, Keycloak and Pepr:

<!-- x-release-please-start-version -->

```bash
uds deploy k3d-core-slim-dev:0.48.0
```

> [!IMPORTANT]
> The k3d-core-slim-dev bundle is intended for dev/test/demo environments and should not be used for production use.

> [!TIP]
> While the k3d-core-slim-dev bundle will work without internet, DNS will likely not resolve. If you are in an airgapped environment you may need to configure your /etc/hosts file such as:
> ```
> 0.48.0.1 localhost yourAppNameHere.uds.dev sso.uds.dev keycloak.admin.uds.dev
> ```

<!-- x-release-please-end -->

#### Developing UDS Core

UDS Core development leverages the `uds zarf dev deploy` command. For convenience, a UDS Task is provided to setup the environment. You'll need to have [NodeJS](https://nodejs.org/en/download/) 20 or later installed to continue. Here's an example of a flow developing the [identity-authorization layer](./packages/identity-authorization/README.md):

```bash
# Create the dev environment
uds run dev-setup

# If developing the Pepr module:
npx pepr dev

# If not developing the Pepr module (can be run multiple times):
npx pepr deploy

# Deploy the layer (can be run multiple times)
uds run dev-deploy --set LAYER=identity-authorization
```

#### Testing UDS Core

You can perform a complete test of UDS Core by running the following command:

```bash
uds run test-uds-core
```

This will create a local k3d cluster, install UDS Core, and run a series of tests against it, the same tests that are run in CI. If you want to run the tests against a specific core layer, you can use the `LAYER` task variable. The following example runs the tests against the identity-authorization layer:

```bash
uds run test-single-layer --set LAYER=identity-authorization
```

Note you can specify the `--set FLAVOR=registry1` flag to test using Iron Bank images instead of the upstream images.

## UDS Core Architecture Overview

![UDS Core Architecture Diagram](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/uds-core-arch-overview.svg?raw=true)

Diagrams are located in `/docs/.images`. See the [diagram README](./docs/.images/diagrams/README.md) for an explanation and help customizing.
