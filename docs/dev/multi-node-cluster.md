# Setting up a Multi-Node K3d Cluster for UDS Core Development
## Overview
By default, UDS Core development uses a single-node k3d cluster for local testing.

In some scenarios, it is beneficial to run UDS Core on a multi-node cluster to better simulate real Kubernetes environments.

This guide describes how to create a multi-node k3d cluster and deploy UDS Core using available uds tasks.

## Methods
Tasks to assist with multi-node deployments:

### 1. Create a Multi-Node K3d Cluster (Cluster Only)
Task:

```bash
uds run -f tasks/setup.yaml create-k3d-cluster --with K3D_EXTRA_ARGS="--servers 3 --agents 2"
```
This creates a multi-node k3d cluster with:
- 3 servers
- 2 agents

No packages are deployed — you will have a blank multi-node Kubernetes cluster ready for further deployments.

### 2. Deploy UDS Core on a Multi-Node Cluster

```bash
uds run test-uds-core-multi-node
```
This creates a multi-node cluster AND automatically deploys the standard UDS Core bundle on top of it.

## Example Usage
### A. Create a Multi-Node Cluster Only
```bash
uds run -f tasks/setup.yaml create-k3d-cluster --with K3D_EXTRA_ARGS="--servers 3 --agents 2"
```
- After the cluster is created, you can manually deploy additional packages using uds or zarf as needed.

```bash
uds zarf package deploy oci://defenseunicorns/uds-core:<version> --confirm
```

### B. Full Deployment: Cluster + UDS Core
```bash
uds run test-uds-core-multi-node
```
- This will fully prepare a multi-node cluster and install UDS Core in one step.

## Cluster Topology
The created k3d cluster includes:
- k3d-uds-server-0, k3d-uds-server-1, k3d-uds-server-2 (control-plane nodes)
- k3d-uds-agent-0, k3d-uds-agent-1 (worker nodes)

Ideal for HA simulation and scaling tests.

## Configure proxy and CA settings for k3d nodes

Use `scripts/k3d-proxy-config/generate.sh` when your local k3d nodes need outbound proxy settings or a custom certificate authority (CA). The helper reads `HTTPS_PROXY`, `HTTP_PROXY`, and `NO_PROXY` by default, and explicit flags override those environment variables.

Generate a local `UDS_CONFIG` file before running the normal deploy flow:

```bash
scripts/k3d-proxy-config/generate.sh --ca-cert /path/to/proxy-ca.pem
export UDS_CONFIG=build/k3d-proxy/uds-config.yaml
uds run deploy-standard-bundle
```

Merge proxy settings with an existing HA config when you need both sets of variables:

```bash
scripts/k3d-proxy-config/generate.sh \
  --base-config bundles/k3d-standard/uds-ha-config.yaml \
  --ca-cert /path/to/proxy-ca.pem \
  --output build/k3d-proxy/uds-ha-config.yaml
export UDS_CONFIG=build/k3d-proxy/uds-ha-config.yaml
uds run test-uds-core-ha
```

For setup-only flows, print the generated args and pass them through the environment. Do not pass proxy-generated args through `--with`, because `NO_PROXY` values contain commas and the task parser treats commas as input separators.

```bash
export K3D_EXTRA_ARGS="$(scripts/k3d-proxy-config/generate.sh --ca-cert /path/to/proxy-ca.pem --print-args)"
uds run -f tasks/setup.yaml create-k3d-cluster
```

Use the same environment variable for `dev-setup`:

```bash
export K3D_EXTRA_ARGS="$(scripts/k3d-proxy-config/generate.sh --ca-cert /path/to/proxy-ca.pem --print-args)"
uds run dev-setup

## Notes
- The multi-node cluster is still a local k3d environment.
- Networking is provided by Flannel.
- No node taints are applied — all nodes are schedulable.
- UDS Core packages will automatically have their workloads distributed across the cluster by kube-scheduler based on their scheduling rules.
