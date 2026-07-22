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

The supported path starts from a Zarf package that bundles a `Package` CR and a native KubeVirt `VirtualMachine`. The `Package` CR enables UDS platform integration (namespace labels, secret copy, Istio mutation). The `VirtualMachine` is a standard `kubevirt.io/v1` resource -- there is no UDS-owned abstraction layer on top of it.

A minimal package contains two key manifests:

**Package CR** -- enables UDS platform integration for the namespace:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-app
spec:
  kubevirt:
    enabled: true
```

**VirtualMachine** -- a native KubeVirt resource. The uds-vm mutation controller injects Istio annotations automatically when the namespace has the `uds.dev/kubevirt-workload=true` label:

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

See `tests/packages/podinfo-vm/` for a complete working example that bundles these manifests into a Zarf package with a Service and UDS network exposure.

## Enablement Contract

Setting `spec.kubevirt.enabled: true` on a Package CR signals VM workload intent. The uds-vm Pepr module watches for this, applies the `uds.dev/kubevirt-workload=true` label to the namespace, and propagates the `private-registry` secret. The namespace label is the runtime signal that triggers Istio annotation injection on VirtualMachine resources.

The `kubevirt.enabled` field is owned by uds-vm as a user-facing contract. UDS Core keeps the field in the CRD schema but does not interpret it.

## Ownership Boundary

| Capability | Owner |
|------------|-------|
| `spec.kubevirt.enabled` on Package CR | uds-vm (user-facing contract) |
| `uds.dev/kubevirt-workload` namespace label | uds-vm (applies and manages) |
| `private-registry` secret propagation | uds-vm |
| VM mutation controller (Istio annotations) | uds-vm |
| KubeVirt/CDI policy exceptions (pod-name-level) | UDS Core (cannot be expressed via Pepr exemption mechanism) |

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

This package has two layers of tests:

| Layer | Location | What it tests |
|-------|----------|---------------|
| Pepr unit tests | `tests/pepr/` | VM mutation logic, namespace label handling |
| Cluster integration tests | `tests/*.spec.ts` | Full-stack behavior (requires live cluster + KubeVirt) |

The integration tests (`kubevirt-istio.spec.ts`, `kubevirt-integration.spec.ts`) are cross-cutting. They verify core policy exceptions (pod-name-level allowances for virt-launcher, CDI pods) alongside uds-vm namespace lifecycle behavior. The unit tests for the core policy logic live in uds-core (`src/pepr/policies/istio.spec.ts`).

```bash
# Unit tests (no cluster needed)
npx vitest run tests/pepr/

# Integration tests (requires active kube context)
npx vitest run tests/kubevirt-istio.spec.ts tests/kubevirt-integration.spec.ts

# Full task-driven validation
uds run -f tasks.yaml vm-test
uds run -f tasks.yaml podinfo-vm-test
uds run -f tasks.yaml live-migration-test
```

## Windows VMs

Windows VMs use CDI to upload a pre-built ISO and KubeVirt's `sysprep` volume for unattended installation. The root disk uses a SATA bus to avoid VirtIO driver dependencies during install.

See [Windows VM Deployment](docs/windows-vm-deployment.md) for the full walkthrough.

## Air-Gapped Environments

The Zarf package bundles the required runtime and Linux demo images, including the Fedora container disk used by the current package-driven flow. No external access is needed after package creation.
