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
modules=("br_netfilter" "xt_REDIRECT" "xt_owner" "xt_statistic" "iptable_mangle" "iptable_nat" "xt_conntrack" "xt_tcpudp")
for module in "${modules[@]}"; do
  modprobe "$module"
  echo "$module" >> "/etc/modules-load.d/istio-modules.conf"
done
```

In addition, to run Istio ingress gateways (part of Core) you will need to ensure your cluster supports dynamic load balancer provisioning when services of type LoadBalancer are created. Typically in cloud environments this is handled using a cloud provider's controller (example: [AWS LB Controller](https://github.com/kubernetes-sigs/aws-load-balancer-controller)). When deploying on-prem, this is commonly done by using a "bare metal" load balancer provisioner like [MetalLB](https://metallb.universe.tf/) or [kube-vip](https://kube-vip.io/). Certain distributions may also include ingress controllers that you will want to disable as they may conflict with Istio (example: RKE2 includes ingress-nginx).

:::note
If you would like to use MetalLB as your load balancer provisioner there is a UDS Package available for MetalLB from the [UDS Package MetalLB GitHub repository](https://github.com/uds-packages/metallb)
:::

##### Ambient Mode

Istio can be deployed in [Ambient Mode](https://istio.io/latest/docs/ambient/overview/) by deploying the optional `istio-ambient` component. This mode is still in alpha release and is not recommended for production use or for clusters requiring `FIPS` compliance. The `istio-ambient` component installs the Istio CNI plugin which requires specifying the `CNI_CONF_DIR` and `CNI_BIN_DIR` variables. These values can change based on the environment Istio is being deployed into. By default the package will attempt to auto-detect these values and will use the following values if not specified:

```yaml
# K3d cluster
cniConfDir: /var/lib/rancher/k3s/agent/etc/cni/net.d
cniBinDir: /bin/

# K3s cluster
cniConfDir: /var/lib/rancher/k3s/agent/etc/cni/net.d
cniBinDir: /opt/cni/bin/

# All other clusters
cniConfDir: /etc/cni/net.d
cniBinDir: /opt/cni/bin/
```

These values can be overwritten when installing core by setting the `cniConfDir` and `cniBinDir` values in the `istio-ambient` component.

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
---
- name: uds-core
  repository: ghcr.io/defenseunicorns/packages/private/uds/core
  ref: 0.25.2-unicorn
  optionalComponents:
    - metrics-server
```

#### Loki

The Loki deployment is (by default) backed by an object storage provider for log retention.  For cloud environments you can wire this into the environment's storage provider with the following overrides:

```yaml
loki:
  values:
    - path: loki.storage.s3.endpoint
      value: "<s3-endpoint>"
    - path: loki.storage.s3.secretAccessKey
      value: "<s3-secret-key>"
    - path: loki.storage.s3.accessKeyId
      value: "<s3-access-key>"
    - path: loki.storage.bucketNames.chunks
      value: "<chunks-bucket-name>"
    - path: loki.storage.bucketNames.ruler
      value: "<ruler-bucket-name>"
    - path: loki.storage.bucketNames.admin
      value: "<admin-bucket-name>"
    - path: loki.storage.bucketNames.region
      value: "<s3-region>"
```

You can also use the [Minio Operator UDS Package](https://github.com/defenseunicorns/uds-package-minio-operator) to back Loki with the following overrides:

```yaml
- name: minio-operator
  ...
  overrides:
    minio-operator:
      uds-minio-config:
        values:
          - path: apps
            value:
              - name: loki
                namespace: loki
                remoteSelector:
                  app.kubernetes.io/name: loki
                bucketNames:
                  - uds-loki-chunks
                  - uds-loki-ruler
                  - uds-loki-admin
                copyPassword:
                  enabled: true

- name: core-logging
  ...
  overrides:
    loki:
      loki:
        values:
          - path: loki.storage.bucketNames.chunks
            value: "uds-loki-chunks"
          - path: loki.storage.bucketNames.ruler
            value: "uds-loki-ruler"
          - path: loki.storage.bucketNames.admin
            value: "uds-loki-admin"
          - path: loki.storage.s3.endpoint
            value: http://uds-minio-hl.minio.svc.cluster.local:9000/
          - path: loki.storage.s3.region
            value: ""
          - path: loki.storage.s3.accessKeyId
            value: ${LOKI_ACCESS_KEY_ID}
          - path: loki.storage.s3.secretAccessKey
            value: ${LOKI_SECRET_ACCESS_KEY}
          - path: loki.storage.s3.s3ForcePathStyle
            value: true
          - path: loki.storage.s3.signatureVersion
            value: "v4"
          - path: write.extraArgs
            value:
            - "-config.expand-env=true"
          - path: write.extraEnv
            value:
            - name: LOKI_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: minio-loki
                  key: accessKey
            - name: LOKI_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: minio-loki
                  key: secretKey
          - path: read.extraArgs
            value:
            - "-config.expand-env=true"
          - path: read.extraEnv
            value:
            - name: LOKI_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: minio-loki
                  key: accessKey
            - name: LOKI_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: minio-loki
                  key: secretKey
```

#### Velero

The Velero deployment is (by default) backed by an object storage provider for backup retention.  For cloud environments you can wire this into the environment's storage provider with the following overrides:

```yaml
velero:
  values:
    - path: credentials.secretContents.cloud
      value: |
        [default]
        aws_access_key_id=<s3-access-key>
        aws_secret_access_key=<s3-secret-key>
    - path: "configuration.backupStorageLocation"
      value:
        - name: default
          provider: aws
          bucket: "<bucket-name>"
          config:
            region: "<s3-region>"
            s3ForcePathStyle: true
            s3Url: "<s3-endpoint>"
          credential:
            name: "velero-bucket-credentials"
            key: "cloud"
```

You can also use the [Minio Operator UDS Package](https://github.com/defenseunicorns/uds-package-minio-operator) to back Velero with the following overrides:

```yaml
- name: minio-operator
  ...
  overrides:
    minio-operator:
      uds-minio-config:
        values:
          - path: apps
            value:
              - name: velero
                namespace: velero
                remoteSelector:
                  app.kubernetes.io/name: velero
                bucketNames:
                  - uds-velero
                copyPassword:
                  enabled: true
                  secretIDKey: AWS_ACCESS_KEY_ID
                  secretPasswordKey: AWS_SECRET_ACCESS_KEY

- name: core-backup-restore
  ...
  overrides:
    velero:
      velero:
        values:
          - path: "credentials"
            value:
              useSecret: true
              existingSecret: "minio-velero"
              extraEnvVars:
                AWS_ACCESS_KEY_ID: dummy
                AWS_SECRET_ACCESS_KEY: dummy
          - path: "configuration.backupStorageLocation"
            value:
              - name: default
                provider: aws
                bucket: "uds-velero"
                config:
                  region: ""
                  s3ForcePathStyle: true
                  s3Url: "http://uds-minio-hl.minio.svc.cluster.local:9000/"
```

:::caution
If you are using the in-cluster Minio Operator UDS Package for backups you must ensure that the volumes that back that storage are themselves backed up!  Cluster or deployment issues may result in a loss of Minio as well as the application you intend to back up.
:::
