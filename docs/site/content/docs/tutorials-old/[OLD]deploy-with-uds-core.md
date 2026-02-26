---
title: LEGACY --Deploy with UDS Core
draft: true
---

## Sample Application with UDS Core

This tutorial uses UDS CLI to deploy an example application, [podinfo](https://github.com/stefanprodan/podinfo), alongside UDS Core as a UDS Bundle.

### Prerequisites

- [Zarf](https://docs.zarf.dev/getting-started/)
- [UDS CLI](https://uds.defenseunicorns.com/reference/cli/overview/)
- [Docker](https://www.docker.com/)
- [k3d](https://k3d.io)

### Quickstart

To begin, a Zarf Package needs to be created for `podinfo`. See the [Zarf documentation](https://docs.zarf.dev/) for in-depth information on how to create a Zarf Package, or simply use the information provided below to create a basic package.

#### Make a Directory

Make a new directory for this package using the following command:

```bash
mkdir package && cd package
```

Create the following `zarf.yaml` in the new directory:

```yaml
kind: ZarfPackageConfig
metadata:
  name: podinfo
  version: 0.0.1

components:
  - name: podinfo
    required: true
    charts:
      - name: podinfo
        version: 6.10.1
        namespace: podinfo
        url: https://github.com/stefanprodan/podinfo.git
        gitPath: charts/podinfo
    images:
      - ghcr.io/stefanprodan/podinfo:6.10.1
    actions:
      onDeploy:
        after:
          - wait:
              cluster:
                kind: deployment
                name: podinfo
                namespace: podinfo
                condition: available
```

#### Create the Zarf Package

Run the following command in the same directory as the above `zarf.yaml`. This will create a Zarf Package named `zarf-package-podinfo-<arch>-0.0.1.tar.zst`:

```bash
zarf package create --confirm
```

> [!NOTE]
> The `<arch>` field in the name of your Zarf Package will depend on your system architecture (eg. `zarf-package-podinfo-amd64-0.0.1.tar.zst`).

#### Create the UDS Bundle

Create the UDS Bundle in the same directory as the `package` directory. The following bundle includes:

- k3d cluster:  `uds-k3d`.
- Zarf init package: `init`.
- UDS Core: `core`.
- Locally built example application: `podinfo`.

Create the following `uds-bundle.yaml`:

```yaml
kind: UDSBundle
metadata:
  name: podinfo-bundle
  description: Bundle with k3d, Zarf init, UDS Core, and podinfo.
  version: 0.0.1

packages:
  - name: uds-k3d
    repository: ghcr.io/defenseunicorns/packages/uds-k3d
    ref: 0.19.4
    overrides:
      uds-dev-stack:
        minio:
          variables:
            - name: buckets
              description: "Set Minio Buckets"
              path: buckets
            - name: svcaccts
              description: "Minio Service Accounts"
              path: svcaccts
            - name: users
              description: "Minio Users"
              path: users
            - name: policies
              description: "Minio policies"
              path: policies

  - name: init
    repository: oci://ghcr.io/zarf-dev/packages/init
    ref: v0.71.1

  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.61.0-upstream
    overrides:
      # Set overrides for k3d dev stack
      pepr-uds-core:
        module:
          values:
            - path: additionalIgnoredNamespaces
              value:
                - uds-dev-stack
      keycloak:
        keycloak:
          variables:
            - name: KEYCLOAK_HEAP_OPTIONS
              description: "Sets the JAVA_OPTS_KC_HEAP environment variable in Keycloak"
              path: env[0].value
          values:
            - path: env[0]
              value:
                name: JAVA_OPTS_KC_HEAP
                value: "-XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50 -XX:MaxRAM=1G"

  - name: podinfo
    path: ./
    ref: 0.0.1
```

> [!NOTE]
> Use UDS Core version 0.55.1 or newer. Earlier versions may trigger browser certificate errors when accessing example HTTPS endpoints (for example, https://podinfo.uds.dev) due to an outdated development certificate.

UDS Bundles can easily be configured to include additional applications and capabilities. For example, if you would like to deploy [dos-games](https://docs.zarf.dev/tutorials/3-deploy-a-retro-arcade/) instead of `podinfo`, in the `uds-bundle.yaml` simply replace:

```yaml
- name: podinfo
  path: ./
  ref: 0.0.1
```

with:

```yaml
- name: dos-games
  repository: oci://defenseunicorns/dos-games
  ref: 1.0.0
```

> [!NOTE]
> Most UDS Packages are published as Zarf Packages in an OCI registry. This makes it easier to pull packages down into a UDS Bundle. If no OCI artifact is published for a certain application or capability, a new `zarf.yaml` and Zarf Package must be created. Alternatively, you have the option to publish a Zarf Package to an [OCI compliant registry](https://docs.zarf.dev/tutorials/6-publish-and-deploy/).

#### Create and Confirm the UDS Bundle

This process will take a few minutes while UDS CLI pulls down the images that will be deployed. This command will produce a UDS Bundle named `uds-bundle-podinfo-bundle-<arch>-0.0.1.tar.zst`:

```bash
uds create --confirm
```

> [!NOTE]
> As above, the `<arch>` field in the name of your UDS Bundle will depend on your system architecture (eg. `uds-bundle-podinfo-bundle-amd64-0.0.1.tar.zst`).

#### Deploy

You can now deploy the bundle which will create a k3d cluster, deploy UDS Core, and deploy `podinfo`. This process will take approximately 10-15 minutes to complete:

```bash
uds deploy uds-bundle-podinfo-bundle-*-0.0.1.tar.zst --confirm
```

#### Interact with Cluster

Once successfully deployed, you can interact with the deployed cluster and applications using [kubectl](https://kubernetes.io/docs/tasks/tools/) or [k9s](https://k9scli.io/topics/install/). Both tools are included with `uds` as `uds zarf tools kubectl` and `uds zarf tools monitor` respectively. In the command below, we are listing pods and services in `podinfo` namespace that were just deployed as part of the UDS Bundle. Please note that the output for your `podinfo` pod will likely have a different name:

```bash
❯ kubectl get pods,services -n podinfo
NAME                           READY   STATUS    RESTARTS   AGE
pod/podinfo-5cbbf59f6d-bqhsk   1/1     Running   0          2m

NAME              TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)             AGE
service/podinfo   ClusterIP   10.43.63.124   <none>        9898/TCP,9999/TCP   2m
```

Connect to `podinfo` using `kubectl port-forward`:

```bash
kubectl port-forward service/podinfo 9898:9898 -n podinfo
```

You can now use a web browser to naviage to `http://localhost:9898` to interact with `podinfo`.

#### Next Steps

In this section, a Zarf Package was created that consists of the sample application, `podinfo`. The resulting `podinfo` Zarf Package was added to a UDS Bundle where additional Zarf Packages such as a K3d cluster, Zarf Internal components, and UDS Core were included. With the stack now deployed, visit the next page to discover how you can integrate the application with the monitoring, logging, security and other services provided by UDS Core.
