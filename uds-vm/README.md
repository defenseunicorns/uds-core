# UDS KubeVirt

Virtual machine support for [UDS Core](https://github.com/defenseunicorns/uds-core). Deploys [KubeVirt](https://kubevirt.io) and [CDI](https://kubevirt.io/containerized-data-importer/) with Istio mesh integration, monitoring, and policy enforcement.

## Prerequisites

- UDS Core deployed on the cluster
- Kubernetes cluster with hardware virtualization (or `useEmulation: true` for k3d)
- `zarf` CLI

## Quick Start

```bash
# Build the package
zarf package create .

# Deploy (standalone, assumes UDS Core is already running)
zarf package deploy zarf-package-core-kubevirt-*.tar.zst --set KUBEVIRT_USE_EMULATION=true
```

Or use the integrated deploy tasks:

```bash
# Real cluster with UDS Core already running
uds run -f package/tasks.yaml deploy

# k3d (deploys published slim-dev core, then builds and deploys VM support)
uds run -f package/tasks.yaml deploy-k3d
```

The `deploy` task builds the local `core-kubevirt` package and deploys it onto an existing UDS Core cluster. The `deploy-k3d` task deploys the published `k3d-core-slim-dev` bundle, then builds and deploys the local `core-kubevirt` package and imports container disk images for k3d.

## What Gets Deployed

| Component | Namespace | Purpose |
|-----------|-----------|---------|
| KubeVirt v1.8.2 | kubevirt | VM lifecycle management |
| CDI v1.65.0 | cdi | Container disk and PVC import |
| ServiceMonitors | kubevirt, cdi | Prometheus metrics scraping |
| PeerAuthentication | kubevirt, cdi | mTLS between components |
| AuthorizationPolicy | kubevirt | Webhook access for virt-operator |
| UDS Package CRs | kubevirt, cdi | Istio mesh and network policies |
| Exemption CR | uds-policy-exemptions | Policy bypass for virt-handler |

## Deploying a VM

1. Create a namespace with a Package CR:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-app
spec:
  kubevirt:
    enabled: true
  network:
    peerauthentication: {}
```

2. Create a VirtualMachine (no Istio annotations needed):

```yaml
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: my-vm
  namespace: my-app
spec:
  runStrategy: Always
  template:
    spec:
      domain:
        cpu:
          cores: 1
        memory:
          guest: 1Gi
        devices:
          disks:
            - name: rootdisk
              disk:
                bus: virtio
      volumes:
        - name: rootdisk
          containerDisk:
            image: registry.example.com/containerdisks/fedora:latest
```

The operator automatically injects the required Istio annotations (`sidecar.istio.io/inject`, `traffic.sidecar.istio.io/kubevirtInterfaces`, `istio.io/reroute-virtual-interfaces`, `status.sidecar.istio.io/port: "0"`) when the namespace has `spec.kubevirt.enabled: true` on its Package CR.

## Readiness Probe Fix

The `status.sidecar.istio.io/port: "0"` annotation removes the istio-proxy readiness probe from virt-launcher pods. This is required because KubeVirt's masquerade networking breaks the default sidecar readiness check. The operator injects this automatically.

## Integration with UDS Core

This package requires the following UDS Core capabilities:

| Capability | Purpose |
|------------|---------|
| `spec.kubevirt.enabled` on Package CR | Triggers namespace label and secret copy |
| `uds.dev/kubevirt-workload` label | Set by operator, used by Pepr policies |
| `private-registry` secret copy | Ensures image pull access in VM namespaces |
| Pepr policy exceptions | Allows `kubevirtInterfaces` and `reroute-virtual-interfaces` on `virt-launcher-*` pods |
| VM mutation controller | Auto-injects Istio annotations on VirtualMachine resources |

## k3d Development

Running on k3d requires additional setup:

### Emulation Mode

k3d nodes don't have hardware virtualization. Pass `KUBEVIRT_USE_EMULATION=true` at deploy time (or via the bundle variable).

### Container Disk Images

k3d's local registry sometimes doesn't serve images to node containerd properly. If pods fail with `ImagePullBackOff` for container disk images:

```bash
# Pull the image
docker pull quay.io/containerdisks/fedora:latest

# Import into k3d node containerd
docker exec k3d-uds-server-0 ctr -n k8s.io images import - <(docker save quay.io/containerdisks/fedora:latest)

# Tag for the Zarf registry
docker exec k3d-uds-server-0 ctr -n k8s.io images tag 127.0.0.1:31999/containerdisks/fedora:latest-zarf-XXXXX 127.0.0.1:31999/containerdisks/fedora:latest-zarf-XXXXX
```

This is a k3d-specific workaround. On real clusters with routable registries, images pull automatically.

### CDI Scratch Storage

CDI needs a writable scratch space. Patch the CDI CR after deploy:

```bash
kubectl patch cdi cdi --type merge -p '{"spec":{"scratchSpaceStorageClass":"local-path"}}'
```

## Testing

Run the integration tests:

```bash
# All tests
zarf tools yq eval '.tasks.all' tasks.yaml

# Individual tests
zarf tools yq eval '.tasks.vm-test' tasks.yaml
zarf tools yq eval '.tasks.podinfo-vm-test' tasks.yaml
zarf tools yq eval '.tasks.live-migration-test' tasks.yaml
```

## Windows VMs

Windows VMs use CDI to upload a pre-built ISO and KubeVirt's `sysprep` volume for unattended installation. The root disk uses a SATA bus to avoid VirtIO driver dependencies during install.

See [Windows VM Deployment](docs/windows-vm-deployment.md) for the full walkthrough.

## Air-Gapped Environments

The Zarf package bundles all required images including container disk demos (`fedora`, `cirros`). No external access is needed after package creation.
