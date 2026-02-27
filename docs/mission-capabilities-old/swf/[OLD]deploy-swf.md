---
title: LEGACY --Deploy Software Factory
draft: true
---

## Prerequisites

- [K3D](https://k3d.io/) version v5.6.0 for development and testing environments.
- Any [CNCF Certified Kubernetes Cluster](https://www.cncf.io/training/certification/software-conformance/#logos) for production environments.
- [UDS CLI](https://github.com/defenseunicorns/uds-cli?tab=readme-ov-file#install) version 0.10.4 or later.

## Apple Silicon Mac Users

When deploying on an Apple Silicon Mac, you have the option to utilize [Colima](https://github.com/abiosoft/colima), an open-source alternative to Docker Desktop, for deploying this bundle. You can install Colima via Homebrew by executing the command `brew install colima`.

To set up an appropriately configured Colima virtual machine, run the following command:

```bash
colima start --cpu 11 --memory 32 --disk 100 --vm-type vz  --vz-rosetta --arch aarch64 --profile uds
```

Certain configurations must be set on the host to ensure a smooth deployment of SonarQube and UDS Core. Note: From our testing these steps are not required with Docker Desktop.

SSH To the colima VM:

```bash
colima ssh --profile uds
```

Then run the following commands:

```bash
sudo sysctl -w vm.max_map_count=1524288
sudo sysctl -w fs.file-max=1000000
ulimit -n 1000000
ulimit -u 8192
sudo sysctl --load
sudo swapoff -a
sudo sysctl fs.inotify.max_user_instances=8192
sudo sysctl -p
exit
```

## Linux Users

Depending on your Linux distribution and its configuration, you may need to execute the following steps to ensure the proper deployment of Software Factory and/or UDS Core:

```bash
sudo sysctl -w vm.max_map_count=1524288
sudo sysctl -w fs.file-max=1000000
ulimit -n 1000000
ulimit -u 8192
sudo sysctl --load
sudo swapoff -a
sudo sysctl fs.inotify.max_user_instances=8192
sudo sysctl -p
```

## Quickstart

**Step 1: Install [UDS CLI](https://uds.defenseunicorns.com/reference/cli/overview/)

```bash
brew tap defenseunicorns/tap && brew install uds
```

**Step 2: Deploy**

To experiment with the UDS Software Factory, you can use the [`k3d-swf-demo`](https://github.com/defenseunicorns/uds-software-factory/blob/main/bundles/k3d-demo/README.md) bundle to create a local K3d cluster featuring complete installations of UDS Core and Software Factory.

To deploy this bundle, run the following command:

```bash
uds deploy k3d-swf-demo:0.2.2
```

**Optional:**

Use the following command to visualize resources in the cluster via [K9s:](https://k9scli.io/)

```bash
uds zarf tools monitor
```

**Step 3: Clean Up**

Upon completion of the Software Factory demo bundle, execute the following command to tear down the K3d cluster:

```bash
k3d cluster delete uds
```

Alternatively, you have the option to deploy the [`swf-dev`](https://github.com/defenseunicorns/uds-software-factory/blob/main/bundles/dev/README.md) bundle, designed to be deployed atop [`k3d-core-slim-dev`](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-slim-dev/README.md). This bundle encompasses the entire Software Factory, while leveraging only a portion of the underlying UDS Core baseline. This design allows the bundle to run on a broader range of hardware, specifically tailored for local development environments.

If using the `swf-dev` bundle, users have two options for deployment:

- Build and deploy directly from the source.
- Deploy the pre-built artifacts hosted in the GHCR OCI registry.

### OCI

Run the below command to deploy the `k3d-core-slim-dev` bundle:

```bash
uds deploy k3d-core-slim-dev:0.22.0
```

Then run the following command to deploy the `swf-dev` bundle on top of the development cluster:

```bash
uds deploy swf-dev:0.2.2
```

You can then configure keycloak. Use zarf connect to establish a connection to the keycloak admin endpoint:

```bash
uds zarf connect keycloak
```

Refer to the UDS Core [documentation](https://uds.defenseunicorns.com/reference/uds-core/overview/) for more details on how to configure keycloak users and groups.

### Source

**Step 1: Clone the Software Factory Repository**

```bash
git clone https://github.com/defenseunicorns/uds-software-factory.git
```

To build and deploy from the source you can utilize the [UDS tasks](https://github.com/defenseunicorns/uds-software-factory/tree/main/tasks) by running:

```bash
uds run
```

If you need to create a test user in keyloak you can then run:

```bash
uds run setup:create-doug-user
```
