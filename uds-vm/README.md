# UDS VM

UDS VM is the UDS capability for virtual machine workloads on [UDS Core](https://github.com/defenseunicorns/uds-core). It deploys [KubeVirt](https://kubevirt.io) and [CDI](https://kubevirt.io/containerized-data-importer/) with Istio mesh integration, monitoring, and policy enforcement.

## Prerequisites

- UDS Core deployed on the cluster
- Kubernetes cluster with hardware virtualization (or `useEmulation: true` for k3d)
- `uds` CLI

## Quick Start

```bash
# Build the package
uds zarf package create . --flavor upstream

# Deploy (standalone, assumes UDS Core is already running)
uds zarf package deploy build/zarf-package-uds-vm-amd64-$(uds zarf tools yq e '.metadata.version' zarf.yaml)-upstream.tar.zst --set KUBEVIRT_USE_EMULATION=true
```

You can also use the repo tasks as the source of truth for local workflows:

```bash
# Real cluster with UDS Core already running
uds run -f tasks.yaml deploy

# k3d (clones the latest released uds-core baseline, deploys its slim-dev bundle, then builds and deploys VM support)
uds run -f tasks.yaml deploy-k3d

# Full k3d integration flow, including cluster-backed Vitest assertions
uds run -f tasks.yaml test-k3d
```

The `deploy` task builds the local `uds-vm` package and deploys it onto an existing UDS Core cluster. The `deploy-k3d` task clones the latest released `uds-core` tag, builds and deploys that release's `k3d-core-slim-dev` bundle, then builds and deploys the local `uds-vm` package and imports container disk images for k3d.

## What Gets Deployed

The package installs the following components:

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

Start by creating a namespace with a `Package` CR:

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

Next, create a `VirtualMachine`. You do not need to add Istio annotations yourself:

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

This package relies on the following UDS Core capabilities:

| Capability | Purpose |
|------------|---------|
| `spec.kubevirt.enabled` on Package CR | Triggers namespace label and secret copy |
| `uds.dev/kubevirt-workload` label | Set by operator, used by Pepr policies |
| `private-registry` secret copy | Ensures image pull access in VM namespaces |
| Pepr policy exceptions | Allows `kubevirtInterfaces` and `reroute-virtual-interfaces` on `virt-launcher-*` pods |
| VM mutation controller | Auto-injects Istio annotations on VirtualMachine resources |

## k3d Development

Running on k3d requires additional setup.

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
uds zarf tools kubectl patch cdi cdi --type merge -p '{"spec":{"scratchSpaceStorageClass":"local-path"}}'
```

## Testing

Use the repo tasks to run the integration coverage:

```bash
uds run -f tasks.yaml all
uds run -f tasks.yaml test-k3d

# Individual tests
uds run -f tasks.yaml vm-test
uds run -f tasks.yaml podinfo-vm-test
uds run -f tasks.yaml live-migration-test
```

`npm test` runs the Vitest cluster integration suite and requires an active kube context. `uds run -f tasks.yaml test-k3d` is the closest match to CI because it stands up the latest released `uds-core` baseline before it runs the VM-specific assertions.

## Windows VMs

Windows VMs use CDI to upload a pre-built ISO and KubeVirt's `sysprep` volume for unattended installation. The root disk uses a SATA bus to avoid VirtIO driver dependencies during install.

See [Windows VM Deployment](docs/windows-vm-deployment.md) for the full walkthrough.

## Air-Gapped Environments

The Zarf package bundles all required images including container disk demos (`fedora`, `cirros`). No external access is needed after package creation.
