---
title: Prerequisites
sidebar:
  order: 2
---

`UDS Core` can run in any [CNCF conformant Kubernetes distribution](https://www.cncf.io/training/certification/software-conformance/) that has not reached [End-of-Life (EOL)](https://kubernetes.io/releases/#release-history). This documentation aims to provide guidance and links to relevant information to help configure your Kubernetes environment and hosts for a successful installation of `UDS Core`. Note that customizations may be required depending on the specific environment.

### Cluster Requirements

When running Kubernetes on any type of host it is important to ensure you are following the upstream documentation from the Kubernetes distribution regarding prerequisites. A few links to upstream documentation are provided below for convenience.

#### RKE2

- [General installation requirements](https://docs.rke2.io/install/requirements)
- [Disabling Firewalld to prevent networking conflicts](https://docs.rke2.io/known_issues#firewalld-conflicts-with-default-networking)
- [Modifying NetworkManager to prevent CNI conflicts](https://docs.rke2.io/known_issues#networkmanager)
- [Known Issues](https://docs.rke2.io/known_issues)

#### K3S

- [General installation requirements](https://docs.k3s.io/installation/requirements)
- [Known Issues](https://docs.k3s.io/known-issues)

#### EKS

- [General installation requirements](https://docs.aws.amazon.com/eks/latest/userguide/create-cluster.html)
- [Troubleshooting Guide](https://docs.aws.amazon.com/eks/latest/userguide/troubleshooting.html)

#### AKS

- [General installation requirements](https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-kubernetes-service)
- [Troubleshooting Guide](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/welcome-azure-kubernetes)

### UDS Core Requirements

The below are specific requirements for running UDS Core. Some of them are tied to the entire stack of UDS Core and some are more specific to certain components. If you encounter issues with a particular component of core, this can be a good list to check to validate you met all the prerequisite requirements for that specific application.

#### Default Storage Class

Several UDS Core components require persistent volumes that will be provisioned using the default storage class via dynamic volume provisioning. Ensure that your cluster includes a default storage class prior to deploying. You can validate by running the below command (see example output which includes `(default)` next to the `local-path` storage class):

```console
❯ kubectl get storageclass
NAME                   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
local-path (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   true                   55s
```

It’s generally beneficial if your storage class supports volume expansion (set `allowVolumeExpansion: true`, provided your provisioner allows it). This enables you to resize volumes when needed. Additionally, be mindful of any size restrictions imposed by your provisioner. For instance, EBS volumes have a minimum size of 1Gi, which could lead to unexpected behavior, especially during Velero’s CSI backup and restore process. These constraints may also necessitate adjustments to default PVC sizes, such as Keycloak’s PVCs, which default to 512Mi in `devMode`.

#### Network Policy Support

The UDS Operator will dynamically provision network policies to secure traffic between components in UDS Core. To ensure these are effective, validate that your CNI supports enforcing network policies. In addition, UDS Core makes use of some CIDR based policies for communication with the KubeAPI server. If you are using Cilium, support for node addressability with CIDR based policies must be enabled with a [feature flag](https://docs.cilium.io/en/stable/security/policy/language/#selecting-nodes-with-cidr-ipblock).

#### Istio

Istio requires a number of kernel modules to be loaded for full functionality. The below is a script that will ensure these modules are loaded and persisted across reboots (see also Istio's [upstream requirements list](https://istio.io/latest/docs/ops/deployment/platform-requirements/)). Ideally this script is used as part of an image build or cloud-init process on each node.

```console
modules=("br_netfilter" "xt_REDIRECT" "xt_owner" "xt_statistic" "iptable_mangle" "iptable_nat" "xt_conntrack" "xt_tcpudp" "xt_connmark" "xt_mark" "ip_set")
for module in "${modules[@]}"; do
  modprobe "$module"
  echo "$module" >> "/etc/modules-load.d/istio-modules.conf"
done
```

In addition, to run Istio ingress gateways (part of Core) you will need to ensure your cluster supports dynamic load balancer provisioning when services of type LoadBalancer are created. Typically in cloud environments this is handled using a cloud provider's controller (example: [AWS LB Controller](https://github.com/kubernetes-sigs/aws-load-balancer-controller)). When deploying on-prem, this is commonly done by using a "bare metal" load balancer provisioner like [MetalLB](https://metallb.universe.tf/) or [kube-vip](https://kube-vip.io/). Certain distributions may also include ingress controllers that you will want to disable as they may conflict with Istio (example: RKE2 includes ingress-nginx).

##### Ambient Mode

[Ambient Mode](https://istio.io/latest/docs/ambient/overview/) in Istio is now integrated directly into the `istio-controlplane` component and enabled by default. Also note that only the `unicorn` and `registry1` flavors of core contain `FIPS` compliant images.

When using ambient mode with UDS Packages, you can benefit from:
- Reduced resource overhead compared to sidecar mode, as workloads don't require an injected sidecar container
- Simplified deployment and operations for service mesh capabilities
- Faster pod startup times since there's no need to wait for sidecar initialization

Note that Packages with Authservice clients are not currently supported in ambient mode and will be rejected by the UDS Operator.

The `istio-controlplane` component installs the Istio CNI plugin which requires specifying the `CNI_CONF_DIR` and `CNI_BIN_DIR` variables. These values can change based on the environment Istio is being deployed into. By default the package will attempt to auto-detect these values and will use the following values if not specified:

```yaml
# K3d cluster
cniConfDir: /var/lib/rancher/k3s/agent/etc/cni/net.d
cniBinDir: /opt/cni/bin/ # Historically this was `/bin/`

# K3s cluster
cniConfDir: /var/lib/rancher/k3s/agent/etc/cni/net.d
cniBinDir: /opt/cni/bin/

# All other clusters
cniConfDir: /etc/cni/net.d
cniBinDir: /opt/cni/bin/
```

These values can be overwritten when installing core by setting the `cniConfDir` and `cniBinDir` values in the `istio-controlplane` component.

To set these values add the following to the `uds-config.yaml` file:

```yaml
variables:
  core-base:
    cni_conf_dir: "foo"
    cni_bin_dir: "bar"
```

or via `--set` if deploying the package via `zarf`:

```console
uds zarf package deploy uds-core --set CNI_CONF_DIR=/etc/cni/net.d --set CNI_BIN_DIR=/opt/cni/bin
```

If you are using Cilium you will also need to make some additional configuration changes and add a cluster wide network policy to prevent Cilium's CNI from interfering with the Istio CNI plugin (part of the ambient stack). See the [upstream documentation](https://istio.io/latest/docs/ambient/install/platform-prerequisites/#cilium) for these required changes.

#### Keycloak

It has been reported that some versions of Keycloak crash on Apple M4 Macbooks (the issue is tracked by [#1309](https://github.com/defenseunicorns/uds-core/issues/1309)). In order to apply a workaround for both [`K3d Slim Dev`](https://github.com/defenseunicorns/uds-core/tree/main/bundles/k3d-slim-dev) and [`k3d Core`](https://github.com/defenseunicorns/uds-core/tree/main/bundles/k3d-standard) bundles, you have to override the `KEYCLOAK_HEAP_OPTIONS` variable and apply the `-XX:UseSVE=0 -XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50 -XX:MaxRAM=1G` value, for example:

```console
uds deploy k3d-core-slim-dev:0.37.0 --set KEYCLOAK_HEAP_OPTIONS="-XX:UseSVE=0 -XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50 -XX:MaxRAM=1G" --confirm
```

Similar overrides might be applied to the UDS Bundle overrides section. Please note that `-XX:MaxRAM` should be equal to the memory limits as this workaround leverages a very similar approach to overriding Keycloak Java Heap settings. Here's an example:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      keycloak:
        keycloak:
          values:
            # Override Java memory settings
            - path: env
              value:
                - name: JAVA_OPTS_KC_HEAP
                  value: "-XX:UseSVE=0 -XX:MaxRAMPercentage=70 -XX:MinRAMPercentage=70 -XX:InitialRAMPercentage=50 -XX:MaxRAM=2G"
            # Override limits - both figures need to match!
            - path: resources.limits.memory
              value: "2Gi"
```

#### NeuVector

NeuVector historically has functioned best when the host is using cgroup v2. Cgroup v2 is enabled by default on many modern Linux distributions, but you may need to enable it depending on your operating system. Enabling this tends to be OS specific, so you will need to evaluate this for your specific hosts.

#### Vector

In order to ensure that Vector is able to scrape the necessary logs concurrently you may need to adjust some kernel parameters for your hosts. The below is a script that can be used to adjust these parameters to suitable values and ensure they are persisted across reboots. Ideally this script is used as part of an image build or cloud-init process on each node.

```console
declare -A sysctl_settings
sysctl_settings["fs.nr_open"]=13181250
sysctl_settings["fs.inotify.max_user_instances"]=1024
sysctl_settings["fs.inotify.max_user_watches"]=1048576
sysctl_settings["fs.file-max"]=13181250

for key in "${!sysctl_settings[@]}"; do
  value="${sysctl_settings[$key]}"
  sysctl -w "$key=$value"
  echo "$key=$value" > "/etc/sysctl.d/$key.conf"
done
sysctl -p
```

#### Metrics Server

Metrics server is provided as an optional component in UDS Core and can be enabled if needed. For distros where metrics-server is already provided, ensure that you do NOT enable metrics-server. See the below as an example for enabling metrics-server if your cluster does not include it.

```yaml
- name: uds-core
  repository: ghcr.io/defenseunicorns/packages/private/uds/core
  ref: 0.25.2-unicorn
  optionalComponents:
    - metrics-server
```
