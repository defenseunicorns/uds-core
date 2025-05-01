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

## Notes
- The multi-node cluster is still a local k3d environment.
- Networking is provided by Flannel.
- No node taints are applied — all nodes are schedulable.
- UDS Core packages will automatically have their workloads distributed across the cluster by kube-scheduler based on their scheduling rules.
