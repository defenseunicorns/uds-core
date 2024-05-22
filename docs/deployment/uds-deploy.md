---
title: Deploy UDS Core
type: docs
weight: 2
---

## Prerequisites

Please ensure that the following prerequisites are on your machine prior to deploying UDS Core:

- [Docker](https://formulae.brew.sh/formula/docker#default), or as an open source alternative, you can use [Colima](https://formulae.brew.sh/formula/colima#default).
  - If using Colima, please declare the following resources after installing:

```git
colima start --cpu 6 --memory 14 --disk 50
```

- [K3d](https://formulae.brew.sh/formula/k3d#default) for development and test environments or a [CNCF Certified Kubernetes Cluster](https://www.cncf.io/training/certification/software-conformance/#logos) if deploying to production environments.
- Dynamic [load-balancer](https://kubernetes.io/docs/concepts/services-networking/service/#loadbalancer) provisioning such as [MetalLB](https://metallb.universe.tf/).
- Object storage of your choosing such as [Minio](https://min.io/product/kubernetes) or [S3](https://aws.amazon.com/s3/).

## UDS Bundles

UDS Core provides published [bundles](https://uds.defenseunicorns.com/bundles/) that serve multiple purposes: you can utilize them for experimenting with UDS Core or for UDS Package development when you only require specific components of UDS Core. These bundles leverage [UDS K3d](https://github.com/defenseunicorns/uds-k3d) to establish a local k3d cluster.

UDS Bundles deployed for development and testing purposes are comprised of a shared configuration that equips users with essential tools, emulating a development environment for convenience. If deploying to a production environment, users have the ability to modify variables and configurations to best fit specific mission needs by creating their own bundle.

{{% alert-note %}}
These UDS Bundles are designed specifically for development and testing environments and are *not intended for production use*. Additionally, they serve as examples for creating customized bundles.
{{% /alert-note %}}

## Quickstart: Development and Test Environments

**Step 1: Install the [UDS CLI](https://uds.defenseunicorns.com/cli/)**

It is recommended to update to the latest version, all releases can be found in the [UDS CLI GitHub repository](https://github.com/defenseunicorns/uds-cli/releases).

```git
brew tap defenseunicorns/tap && brew install uds
```

**Step 2: Deploy the UDS Bundle**

The UDS Bundle being deployed in this example is the [`k3d-core-demo`](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-standard/README.md) bundle which creates a local k3d cluster with UDS Core installed.

```cli
uds deploy k3d-core-demo:0.20.0

# deploy this bundle?
y
```

For additional information on UDS Bundles, please see the [UDS Bundles documentation.](https://uds.defenseunicorns.com/bundles/)

**Optional:**

Use the following command to visualize resources in the cluster via [k9s:](https://k9scli.io/)

```git
uds zarf tools monitor
```

**Step 3: Clean Up**

Use the following command to tear down the k3d cluster:

```git
k3d cluster delete uds
```

If you opted to use Colima, use the following command to tear down the virtual machine that the cluster was running on:

```git
colima delete -f
```

## UDS Bundle Development

In addition to the demo bundle, there is also a [`k3d-slim-dev bundle`](https://github.com/defenseunicorns/uds-core/tree/main/bundles/k3d-istio) designed specifically for working with UDS Core with *only* Istio, Keycloak, and Pepr installed. To use it, execute the following command:

```cli
uds deploy k3d-core-slim-dev:0.20.0
```

## Developing UDS Core

UDS Core development leverages the `uds zarf dev deploy` command. To simplify the setup process, a dedicated UDS Task is available. Please ensure you have [NodeJS](https://nodejs.org/en/download/) version 20 or later installed before proceeding.

Below is an example of the workflow developing the [metrics-server package](https://github.com/defenseunicorns/uds-core/tree/main/src/metrics-server):

```cli
# Create the dev environment
uds run dev

# If developing the Pepr module:
npx pepr dev

# If not developing the Pepr module (can be run multiple times):
npx pepr deploy

# Deploy the package (can be run multiple times)
uds run dev-deploy --set PKG=metrics-server
```

## Testing UDS Core

You can perform a complete test of UDS Core by running the following command:

```cli
uds run test-uds-core
```

This command initiates the creation of a local k3d cluster, installs UDS Core, and executes a set of tests identical to those performed in CI. If you wish to run tests targeting a specific package, you can utilize the `PKG` environment variable.

The example below runs tests against the metrics-server package:

```cli
UDS_PKG=metrics-server uds run test-single-package
```

{{% alert-note %}}
You can specify the `--set FLAVOR=registry1` flag to test using Iron Bank images instead of the upstream images.
{{% /alert-note %}}
