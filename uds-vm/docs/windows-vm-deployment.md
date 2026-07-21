# Deploy a Windows VM on KubeVirt

This guide walks you through deploying a Windows Server 2022 VM on KubeVirt with UDS Core, using CDI to upload a pre-built ISO and KubeVirt's `sysprep` volume for unattended installation.

## Prerequisites

- UDS Core deployed on a Kubernetes cluster with KubeVirt and CDI installed
- `virtctl` CLI (v1.8.2+)
- `kubectl` access to the cluster
- A Windows Server 2022 ISO (evaluation or licensed)
- KVM available on the node (or `useEmulation: true` for k3d)

## Before you begin

This approach uploads a stock Windows ISO via CDI, then uses a ConfigMap-backed `sysprep` volume to provide the autounattend answer file at boot time. Unlike a Packer-based image build flow, this does not require KVM on the build host or a pre-built QCOW2. The tradeoff is that the Windows installer runs inside the cluster (taking 15-30 minutes depending on hardware).

The key insight that makes this work: KubeVirt's `sysprep` volume type injects an answer file as a CD-ROM, but you must also add an explicit `cdrom` disk entry with `bus: sata` for Windows Setup to detect it. Without the explicit disk entry, KubeVirt attaches it as a hard disk and Windows Setup ignores it.

## Steps

### 1. Upload the Windows ISO via CDI

Create a DataVolume to hold the Windows installer ISO. The DataVolume triggers CDI to create a PVC and expose an upload endpoint.

```yaml title="windows-installer-dv.yaml"
apiVersion: cdi.kubevirt.io/v1beta1
kind: DataVolume
metadata:
  name: windows-installer-2022
  namespace: default
spec:
  source:
    upload: {}
  pvc:
    accessModes:
      - ReadWriteOnce
    storageClassName: local-path
    resources:
      requests:
        storage: 8Gi
```

```bash
kubectl apply -f windows-installer-dv.yaml
```

Start a port-forward to the CDI upload proxy:

```bash
kubectl port-forward -n cdi svc/cdi-uploadproxy 30085:443 &
```

Upload the ISO using `virtctl`:

```bash
virtctl image-upload dv windows-installer-2022 \
  --uploadproxy-url=https://127.0.0.1:30085 \
  --insecure \
  --image-path=/path/to/SERVER_EVAL_x64FRE_en-us.iso
```

> [!NOTE]
> The upload speed depends on your network connection to the cluster. A 4.7 GB ISO typically takes 15-30 seconds on a local k3d cluster.

Verify the PVC is bound:

```bash
kubectl get pvc windows-installer-2022
```

### 2. Create the autounattend ConfigMap

The autounattend answer file automates the Windows installation. Store it in a ConfigMap that KubeVirt will inject as a CD-ROM via the `sysprep` volume type.

```yaml title="windows-sysprep-cm.yaml"
apiVersion: v1
kind: ConfigMap
metadata:
  name: windows-sysprep
  namespace: default
data:
  Autounattend.xml: |
    <?xml version="1.0" encoding="utf-8"?>
    <unattend xmlns="urn:schemas-microsoft-com:unattend">
      <settings pass="windowsPE">
        <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64"
                   publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"
                   xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <SetupUILanguage>
            <UILanguage>en-US</UILanguage>
          </SetupUILanguage>
          <InputLocale>en-US</InputLocale>
          <SystemLocale>en-US</SystemLocale>
          <UILanguage>en-US</UILanguage>
          <UserLocale>en-US</UserLocale>
        </component>
        <component name="Microsoft-Windows-Setup" processorArchitecture="amd64"
                   publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"
                   xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <DiskConfiguration>
            <Disk wcm:action="add">
              <CreatePartitions>
                <CreatePartition wcm:action="add">
                  <Order>1</Order>
                  <Type>Primary</Type>
                  <Extend>true</Extend>
                </CreatePartition>
              </CreatePartitions>
              <ModifyPartitions>
                <ModifyPartition wcm:action="add">
                  <Order>1</Order>
                  <PartitionID>1</PartitionID>
                  <Format>NTFS</Format>
                  <Label>Windows</Label>
                  <Letter>C</Letter>
                </ModifyPartition>
              </ModifyPartitions>
              <DiskID>0</DiskID>
              <WillWipeDisk>true</WillWipeDisk>
            </Disk>
          </DiskConfiguration>
          <ImageInstall>
            <OSImage>
              <InstallFrom>
                <MetaData wcm:action="add">
                  <Key>/IMAGE/NAME</Key>
                  <Value>Windows Server 2022 SERVERSTANDARD</Value>
                </MetaData>
              </InstallFrom>
              <InstallTo>
                <DiskID>0</DiskID>
                <PartitionID>1</PartitionID>
              </InstallTo>
            </OSImage>
          </ImageInstall>
          <UserData>
            <AcceptEula>true</AcceptEula>
          </UserData>
        </component>
      </settings>
      <settings pass="specialize">
        <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64"
                   publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"
                   xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <ComputerName>WIN-SERVER-2022</ComputerName>
          <TimeZone>UTC</TimeZone>
        </component>
        <component name="Microsoft-Windows-ServerManager-SvrMgrNc" processorArchitecture="amd64"
                   publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"
                   xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <DoNotOpenServerManagerAtLogon>true</DoNotOpenServerManagerAtLogon>
        </component>
      </settings>
      <settings pass="oobeSystem">
        <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64"
                   publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS"
                   xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <OOBE>
            <HideEULAPage>true</HideEULAPage>
            <HideLocalAccountScreen>true</HideLocalAccountScreen>
            <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
            <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
            <NetworkLocation>Work</NetworkLocation>
            <ProtectYourPC>3</ProtectYourPC>
          </OOBE>
          <UserAccounts>
            <AdministratorPassword>
              <Value>Password123!</Value>
              <PlainText>true</PlainText>
            </AdministratorPassword>
          </UserAccounts>
        </component>
      </settings>
    </unattend>
```

```bash
kubectl apply -f windows-sysprep-cm.yaml
```

> [!IMPORTANT]
> Do not include a `<ProductKey>` block in the autounattend XML when using the evaluation ISO. The GVLK keys do not match the evaluation edition and will cause a "No images are available" error during installation.

### 3. Create the root disk PVC

The root disk is where Windows installs. Use a `local-path` StorageClass with enough space for the OS.

```yaml title="root-disk-pvc.yaml"
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: windows-server-2022-data
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-path
  resources:
    requests:
      storage: 32Gi
```

```bash
kubectl apply -f root-disk-pvc.yaml
```

### 4. Import the VirtIO container disk

KubeVirt needs VirtIO drivers available as a CD-ROM for the Windows installer. Pull the container disk image and import it into k3d's containerd (k3d-specific; on real clusters the image pulls automatically).

```bash
# Pull the VirtIO container disk
docker pull registry.suse.com/suse/vmdp/vmdp:2.5.4.3

# Import into k3d node containerd
docker exec k3d-uds-server-0 ctr -n k8s.io images import - \
  <(docker save registry.suse.com/suse/vmdp/vmdp:2.5.4.3)
```

> [!NOTE]
> The `registry.suse.com/suse/vmdp/vmdp:2.5.4.3` image includes all required VirtIO drivers (viostor, viorng, NetKVM). The `quay.io/kubevirt/virtio-container-disk` image also works but may have older driver versions.

### 5. Create the VirtualMachine

This is the critical manifest. The key configuration points:

- **Root disk uses `sata` bus**, not `virtio`. This eliminates the need to load VirtIO storage drivers during Windows Setup. The Windows installer natively supports SATA.
- **The `sysprep` volume** references the ConfigMap and must have an explicit `cdrom` disk entry with `bus: sata`. Without this, KubeVirt attaches it as a hard disk and Windows Setup ignores it.
- **The VirtIO container disk** is attached as a SATA CD-ROM for post-install driver installation.
- **Machine type `q35`** with Hyper-V features enabled for optimal performance.
- **`running: false`** so you can verify the manifest before starting.

```yaml title="windows-vm.yaml"
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: windows-server-2022
  namespace: default
spec:
  running: false
  template:
    spec:
      domain:
        cpu:
          cores: 4
        memory:
          guest: 8Gi
        machine:
          type: q35
        features:
          acpi: {}
          hyperv:
            relaxed: {}
            vapic: {}
            spinlocks:
              spinlocks: 4095
            smm: {}
          smm:
            enabled: true
        clock:
          utc: {}
        devices:
          disks:
            - name: cdrom-disk
              cdrom:
                bus: sata
              bootOrder: 1
            - name: rootdisk
              disk:
                bus: sata
              bootOrder: 2
            - name: virtio-container-disk
              cdrom:
                bus: sata
              bootOrder: 3
            - name: sysprep
              cdrom:
                bus: sata
          interfaces:
            - name: default
              masquerade: {}
        resources:
          requests:
            memory: 8Gi
      networks:
        - name: default
          pod: {}
      volumes:
        - name: cdrom-disk
          persistentVolumeClaim:
            claimName: windows-installer-2022
        - name: rootdisk
          persistentVolumeClaim:
            claimName: windows-server-2022-data
        - name: virtio-container-disk
          containerDisk:
            image: registry.suse.com/suse/vmdp/vmdp:2.5.4.3
        - name: sysprep
          sysprep:
            configMap:
              name: windows-sysprep
```

> [!WARNING]
> The `sysprep` volume must have an explicit `cdrom` disk entry with `bus: sata` in the `disks` list. If you only add it to `volumes` without a matching disk entry, KubeVirt attaches it as a hard disk and Windows Setup will not find the answer file.

### 6. Start the VM and verify

```bash
# Start the VM
virtctl start windows-server-2022

# Watch for the VMI to become ready
kubectl get vmi -w

# Check the VM is running with KVM
kubectl get vmi windows-server-2022 -o jsonpath='{.status.node}'

# Verify QEMU is using KVM acceleration
kubectl exec -it $(kubectl get pod -l kubevirt.io/domain=windows-server-2022 -o jsonpath='{.items[0].metadata.name}') \
  -- ps aux | grep qemu
```

The Windows installation takes 15-30 minutes depending on hardware. You can monitor progress via VNC screenshot:

```bash
# Start kubectl proxy (if not already running)
kubectl proxy --port=8001 &

# Capture VNC screenshot
curl -s http://127.0.0.1:8001/apis/subresources.kubevirt.io/v1/namespaces/default/virtualmachineinstances/windows-server-2022/vnc/screenshot \
  --output /tmp/vnc_screenshot.png
```

When the installation completes, the VM reboots into Windows. You can log in via `virsh send-key`:

```bash
# Get the virt-launcher pod name
POD=$(kubectl get pod -l kubevirt.io/domain=windows-server-2022 -o jsonpath='{.items[0].metadata.name}')

# Send Ctrl+Alt+Del
kubectl exec $POD -- virsh send-key --domain default_windows-server-2022 --keyscape KEY_LEFTCTRL KEY_LEFTALT KEY_DELETE

# Type the password
kubectl exec $POD -- virsh send-key --domain default_windows-server-2022 --keyscape KEY_P KEY_A KEY_S KEY_S KEY_W KEY_O KEY_R KEY_D KEY_1 KEY_2 KEY_3 KEY_EXCLAMATION
kubectl exec $POD -- virsh send-key --domain default_windows-server-2022 --keyscape KEY_ENTER
```

Verify network connectivity:

```bash
kubectl get vmi windows-server-2022 -o jsonpath='{.status.interfaces[0].ipAddress}'
```

## Troubleshooting

### Problem: Windows Setup shows language selection instead of installing automatically

**Symptom:** VNC screenshot shows a dark blue background with a white dialog (language/time/keyboard selection). The autounattend answer file is not being detected.

**Solution:** Verify the `sysprep` volume has a matching `cdrom` disk entry with `bus: sata` in the `disks` list. KubeVirt silently falls back to hard disk attachment without the explicit disk entry.

### Problem: "No images are available" during Windows Setup

**Symptom:** The installer reaches the image selection screen but shows no available Windows editions.

**Solution:** Remove the `<ProductKey>` block from the autounattend XML. The GVLK keys do not match evaluation ISO editions. The `<Value>` in the `<MetaData>` element must match the image name exactly (for example, `Windows Server 2022 SERVERSTANDARD`). Verify with `wiminfo` from the `wimtools` package:

```bash
wiminfo /path/to/install.wim
```

### Problem: VirtIO storage drivers not found during install

**Symptom:** Windows Setup cannot find a disk to install to.

**Solution:** Use `bus: sata` for the root disk instead of `bus: virtio`. The Windows installer natively supports SATA but requires VirtIO drivers for virtual disks. If you need VirtIO performance post-install, attach the VirtIO container disk as a SATA CD-ROM and install drivers from Device Manager after the OS is running.

### Problem: CDI upload pod blocked by Pepr policy

**Symptom:** CDI upload pod creation fails with a policy violation about Istio annotations.

**Solution:** Ensure the Pepr module includes the CDI exception for `sidecar.istio.io/inject` annotations. The exception allows CDI pods (`importer-*`, `cdi-upload-*`, `cdi-clone-*`) to set `sidecar.istio.io/inject: false`. If using a pre-built package, apply the updated Pepr module from the `chance/vm-poc-separation` branch.

### Problem: ztunnel pod fails to start

**Symptom:** ztunnel pod stuck in `ContainerCreating` with `failed to find plugin "istio-cni" in path [/bin]`.

**Solution:** k3s kubelet looks for CNI plugins in `/bin`, but the istio-cni binary installs to `/var/lib/rancher/k3s/data/cni/istio-cni`. Create a symlink:

```bash
docker exec k3d-uds-server-0 ln -sf \
  /var/lib/rancher/k3s/data/cni/istio-cni \
  /bin/istio-cni
```

Then delete the stuck ztunnel pod to trigger a restart.

### Problem: VM boots but root disk remains empty

**Symptom:** QEMU process runs at high CPU but the root disk file shows minimal allocated blocks. VNC screenshot shows the Windows Setup language selection screen.

**Solution:** The autounattend answer file is not being detected. Check the `sysprep` volume configuration and verify the image name in the autounattend XML matches the ISO content.

## Related documentation

- [Headlamp deployment](./headlamp-deployment.md) - Browser-based VM management with the KubeVirt plugin
- [KubeVirt User Guide: Windows VirtIO Drivers](https://kubevirt.io/user-guide/user_workloads/windows_virtio_drivers/)
- [KubeVirt User Guide: CDI](https://kubevirt.io/user-guide/storage/containerized_data_importer/)
- [UDS VM Architecture](./uds-vm-architecture.md) - Architecture decisions for VM support
- [Out-of-Core VM Support POC](./out-of-core-vm-support-poc.md) - POC status and integration contract
- Packer-based Windows image build flow is not yet present in this extracted repo layout
