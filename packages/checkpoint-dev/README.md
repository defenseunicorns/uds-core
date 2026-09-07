# K3d + UDS Core Slim Dev Checkpoint

This Zarf package captures a running K3d cluster named `uds` and restores it with UDS Core Slim installed. During capture, it temporarily suspends supported Deployments, StatefulSets, DaemonSets, and Deployment-owned ReplicaSets.

> [!CAUTION]
> *KNOWN ISSUE*: ARM64 builds of this package do not properly enforce network policies in GitHub CI. There may be additional unexpected behavior and issues with ARM64 builds.

## Creating this package

1. Set up a K3d cluster (named `uds`) containing the contents you'd like to checkpoint

> [!NOTE]
> The intent for this package is that those contents are the `uds dev stack`, `zarf init` and the `core-slim-dev` package (`core-base` and `core-identity-authorization`).

2. Run `uds zarf package create packages/checkpoint-dev --confirm`

## Deploying this package

```sh
uds zarf package deploy <path-to-zarf-tarball> --confirm
```

> [!NOTE]
> The pre-reqs for this package are the same as `uds-k3d` and you do not need to have a cluster running prior to deploying it.

The restore releases workloads in this order: infrastructure, Pepr admission, Pepr watcher, then applications. The package discovers application workloads from the restored cluster. You do not need to maintain an application list.

> [!CAUTION]
> Creating a checkpoint disrupts workloads on the source cluster while the package captures its state. The create action restores those workloads before it succeeds. If creation stops after it applies the temporary suspension selector, run the retained helper from the Zarf action directory:

```bash
bash ./checkpoint-workloads.sh restore
```
