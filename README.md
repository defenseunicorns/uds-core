# Unicorn Delivery Service - Core (UDS Core)

UDS Core establishes a secure baseline for cloud-native systems and ships with compliance documentation and first-class support for airgap/egress-limited systems. Based on the work of [Platform One](https://p1.dso.mil), UDS Core expands on the security posture of [Big Bang](https://repo1.dso.mil/big-bang/bigbang) while providing advanced automation with the [UDS Operator](./src/pepr/operator/README.md) and [UDS Policy Engine](./src/pepr/policies/README.md). UDS Core is a collection of several individual applications combined into a single [Zarf](https://zarf.dev) package and we recommend using [UDS CLI](https://github.com/defenseunicorns/uds-cli?tab=readme-ov-file#install) to deploy it as a [UDS Bundle](#using-uds-core-in-production).

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
- [Promtail](https://grafana.com/docs/loki/latest/send-data/promtail/) - Log Aggregation
- [Velero](https://velero.io/) - Backup & Restore

#### Future Applications

- [Kiali](https://kiali.io/) - Service Mesh Observability
- [Tempo](https://grafana.com/docs/tempo/latest/getting-started/) - Tracing

---

### Prerequisites

- [K3D](https://k3d.io/) for dev & test environments or any [CNCF Certified Kubernetes Cluster](https://www.cncf.io/training/certification/software-conformance/#logos) for production environments.
<!-- renovate: datasource=github-tags depName=defenseunicorns/uds-cli versioning=semver -->
- [UDS CLI](https://github.com/defenseunicorns/uds-cli?tab=readme-ov-file#install) v0.8.1 or later

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
uds deploy k3d-core-demo:0.17.0
```

<!-- x-release-please-end -->

#### UDS Package Development

In addition to the demo bundle, a [k3d-slim-dev bundle](./bundles/k3d-slim-dev/README.md) also exists to work with UDS Core with only Istio, Keycloak & Pepr installed. Run the command below to use it.

Deploy Istio, Keycloak and Pepr:

<!-- x-release-please-start-version -->

```bash
uds deploy k3d-core-slim-dev:0.17.0
```

<!-- x-release-please-end -->


#### Developing UDS Core

UDS Core development leverages the `uds zarf dev deploy` command. For convenience, a UDS Task is provided to setup the environment. You'll need to have [NodeJS](https://nodejs.org/en/download/) 20 or later installed to continue. Here's an example of a flow developing the [metrics-server package](./src/metrics-server/README.md):

```bash
# Create the dev environment
uds run dev-setup

# If developing the Pepr module:
npx pepr dev

# If not developing the Pepr module (can be run multiple times):
npx pepr deploy

# Deploy the package (can be run multiple times)
uds run dev-deploy --set PKG=metrics-server
```

#### Testing UDS Core

You can perform a complete test of UDS Core by running the following command:

```bash
uds run test-uds-core
```

This will create a local k3d cluster, install UDS Core, and run a series of tests against it, the same tests that are run in CI. If you want to run the tests against a specific package, you can use the `PKG` env variable. The following example runs the tests against the metrics-server package:

```bash
UDS_PKG=metrics-server uds run test-single-package
```

Note you can specify the `--set FLAVOR=registry1` flag to test using Iron Bank images instead of the upstream images.
