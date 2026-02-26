---
title: LEGACY --Install and Deploy UDS (15m)
draft: true
---

## Getting Started with UDS Bundles

UDS Core provides published [bundles](https://uds.defenseunicorns.com/reference/bundles/overview/) that serve multiple purposes: you can 
utilize them for experimenting with UDS Core or for UDS Package development when you only require specific components 
of UDS Core. These bundles leverage [UDS K3d](https://github.com/defenseunicorns/uds-k3d) to establish a local k3d 
cluster.

UDS Bundles deployed for development and testing purposes are comprised of a shared configuration that equips users with
essential tools, emulating a development environment for convenience. If deploying to a production environment, users 
have the ability to modify variables and configurations to best fit specific mission needs by creating their own bundle.

> [!CAUTION]
> These UDS Bundles are designed specifically for development and testing environments and are *not intended for production use*. Additionally, they serve as examples for creating customized bundles.

For additional information on UDS Bundles, please see the [UDS Bundles](/structure/bundles/) page.

## Deploy UDS Core

In this section, you will deploy UDS Core for the first time.

### Step 1: Install the [UDS CLI](https://uds.defenseunicorns.com/reference/cli/overview)

The very first step is installation of the UDS CLI. Having installed Homebrew previously, you can do so with the
following command:

```bash
brew tap defenseunicorns/tap && brew install uds
```

> [!TIP]
> You can see all releases of the UDS CLI on the [UDS CLI GitHub repository](https://github.com/defenseunicorns/uds-cli/releases)

### Step 2: Deploy the UDS Bundle

The UDS Bundle being deployed in this example is the 
[`k3d-core-demo`](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-standard/README.md) bundle, which 
creates a local k3d cluster with UDS Core installed.

To deploy this bundle, run the `uds deploy k3d-core-demo:latest` command in the terminal:

```bash
uds deploy k3d-core-demo:latest

# deploy this bundle?
y
```

> [!NOTE]
> You can also deploy a specific version of the bundle, see all versions of the bundle [here](https://github.com/defenseunicorns/uds-core/pkgs/container/packages%2Fuds%2Fbundles%2Fk3d-core-demo).
>
> If you deploy a specific version and want to update UDS Core, on top of your existing cluster, this can also be done using the [`--packages` flag](/reference/cli/quickstart-and-usage/#specifying-packages-using---packages) to deploy just core (rather than redeploying the full cluster as well): `uds deploy k3d-core-demo:<new-version> --packages core`

**Optional:**

Use the following command to visualize resources in the cluster via [k9s:](https://k9scli.io/)

```bash
uds zarf tools monitor
```

### Step 3: Clean Up

Use the following command to tear down the k3d cluster:

```bash
k3d cluster delete uds
```

If you opted to use Colima, use the following command to tear down the virtual machine that the cluster was running on:

```bash
colima delete -f
```

## UDS Bundle Development

In addition to the demo bundle, there is also a 
[`k3d-slim-dev bundle`](https://github.com/defenseunicorns/uds-core/tree/main/bundles/k3d-slim-dev) designed specifically 
for working with UDS Core with *only* Istio, Keycloak, and Pepr installed. To use it, execute the following command:

```bash
uds deploy k3d-core-slim-dev:latest
```

> [!NOTE]
> You can also deploy a specific version of the bundle, see all versions of the
bundle [here](https://github.com/defenseunicorns/uds-core/pkgs/container/packages%2Fuds%2Fbundles%2Fk3d-core-slim-dev).
>
> If you deploy a specific version and want to update UDS Core, on top of your existing cluster, this can also be done using the [`--packages` flag](/reference/cli/quickstart-and-usage/#specifying-packages-using---packages) to deploy just core (rather than redeploying the full cluster as well): `uds deploy k3d-core-slim-dev:<new-version> --packages core-base,core-identity-authorization`

## Developing UDS Core

UDS Core development leverages the `uds zarf dev deploy` command. To simplify the setup process, a dedicated UDS Task is available. Please ensure you have [NodeJS](https://nodejs.org/en/download/) version 20 or later installed before proceeding.

Below is an example of the workflow developing the [metrics-server package](https://github.com/defenseunicorns/uds-core/tree/main/src/metrics-server):

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

## Testing UDS Core

You can perform a complete test of UDS Core by running the following command:

```bash
uds run test-uds-core
```

This command initiates the creation of a local k3d cluster, installs UDS Core, and executes a set of tests identical to those performed in CI. If you wish to run tests targeting a specific package, you can utilize the `PKG` environment variable.

The example below runs tests against the metrics-server package:

```bash
UDS_PKG=metrics-server uds run test-single-package
```

> [!NOTE]
> You can specify the `--set FLAVOR=registry1` flag to test using Iron Bank images instead of the upstream images.
