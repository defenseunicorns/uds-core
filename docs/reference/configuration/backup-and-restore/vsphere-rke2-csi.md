---
title: RKE2 CSI Snapshotting on vSphere
---

## Introduction
As of Velero v1.14, the velero-plugin-for-csi is included in Velero. This means you no longer need to install a separate velero-plugin-for-csi or the [velero-plugin-for-vsphere](https://github.com/vmware-tanzu/velero-plugin-for-vsphere). This guide covers the configuration required to enable Velero to use a vSphere CSI driver for volume snapshots of a UDS Core deployment.

## Prerequisites
- An RKE2 Kubernetes cluster (additional configuration may be required for other distributions)
- Access to vSphere infrastructure
- UDS Core deployment with Velero configured for S3-compatible object storage

## Using a CSI driver in an RKE2 cluster
The following instructions are specific to an RKE2 cluster, and assume bucket variables required for S3 object storage have already been set. The below tips are not meant to be step-by-step instructions, but useful tips for configuring the CSI driver. To integrate Velero with a CSI driver, you should first install both [rancher-vsphere-cpi](https://github.com/rancher/vsphere-charts/tree/main/charts/rancher-vsphere-cpi) and [rancher-vsphere-csi](https://github.com/rancher/vsphere-charts/tree/main/charts/rancher-vsphere-csi). Installation of the vSphere CPI/CSI on RKE2 is done via setting `cloud-provider-name: rancher-vsphere` in RKE2's `config.yaml`. 

:::note
While RKE2 deploys these helm charts automatically, they will not function correctly until properly configured with vSphere credentials and other settings. The HelmChartConfig overrides shown later in this document are essential for providing these configurations.
:::

## CSI Driver Configuration
When using a vSphere CSI driver, a user must be created in vSphere with the appropriate permissions at the appropriate vSphere object levels. These roles and privileges can be found at [Broadcom vSphere Roles and Privileges](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/container-storage-plugin/3-0/getting-started-with-vmware-vsphere-container-storage-plug-in-3-0/vsphere-container-storage-plug-in-deployment/preparing-for-installation-of-vsphere-container-storage-plug-in.html#GUID-0AB6E692-AA47-4B6A-8CEA-38B754E16567-en). This user is referenced below as `vsphere_csi_username` and `vsphere_csi_password` and is used by Velero to authenticate with the vSphere vCenter API to provision, manage, and snapshot volumes.

:::note
Some roles referenced in the Broadcom link come pre-created and combined with other roles in vSphere, thus the referenced Broadcom roles may be named slightly different in vSphere (e.g., CNS-Datastore role may be called CNS-Supervisor-Datastore in vSphere; CNS-Host-Config-Storage and CNS-VM roles may be combined and called CNS-Supervisor-Host-Config-Storage-And-CNS-VM in vSphere).
:::

At least three overrides must occur in the vSphere CSI driver configuration: `blockVolumeSnapshot`, `configTemplate` and `global-max-snapshots-per-block-volume`
- `blockVolumeSnapshot` must be enabled on the CSI driver to allow the deployment of the [csi-snapshotter](https://github.com/kubernetes-csi/external-snapshotter) sidecar, which is required to create snapshots of volumes
- `configTemplate` must be completely overridden, to allow overriding of the `global-max-snapshots-per-block-volume` setting
- `global-max-snapshots-per-block-volume` should be added as an override within the `configTemplate`, to allow control of how many snapshots are allowed per volume

Example rancher-vsphere-cpi and rancher-vsphere-csi overrides:

```yaml
---
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: rancher-vsphere-cpi
  namespace: kube-system
spec:
  valuesContent: |-
    vCenter:
      host: "{{ vsphere_server }}"
      port: 443
      insecureFlag: true
      datacenters: "<vsphere_datacenter_name>"
      username: "{{ vsphere_csi_username }}"
      password: "{{ vsphere_csi_password }}"
      credentialsSecret:
        name: "vsphere-cpi-creds"
        generate: true
---
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: rancher-vsphere-csi
  namespace: kube-system
spec:
  valuesContent: |-
    vCenter:
      datacenters: "<vsphere_datacenter_name>"
      username: "{{ vsphere_csi_username }}"
      password: "{{ vsphere_csi_password }}"
      configSecret:
        configTemplate: |
          [Global]
          cluster-id = "{{ rke2_token }}"
          user = "{{ vsphere_csi_username }}"
          password = "{{ vsphere_csi_password }}"
          port = 443
          insecure-flag = "1"
          [VirtualCenter "{{ vsphere_server }}"]
          datacenters = "<vsphere_datacenter_name>"
          [Snapshot]
          global-max-snapshots-per-block-volume = 12
    csiNode:
      tolerations:
      - operator: "Exists"
        effect: "NoSchedule"
    blockVolumeSnapshot:
      enabled: true
    storageClass:
      reclaimPolicy: Retain
```

## Snapshot Limit Configuration
The default snapshot limit (3) is insufficient for UDS Core's 10-day [backup retention policy](https://github.com/defenseunicorns/uds-core/blob/main/src/velero/values/values.yaml#L35-L47). 

- Each UDS backup creates approximately 13 snapshots distributed across all volumes
- For a cluster that has 13 volumes, each nightly UDS backup will create 1 snapshot per volume
- After 3 days of backups, the default `global-max-snapshots-per-block-volume` will have been met, and further backups will fail
- To account for 10 days of UDS backups (assuming 13 volumes), set the `global-max-snapshots-per-block-volume` to a minimum of 10
- Consider setting a higher `global-max-snapshots-per-block-volume` to create a buffer that accommodates manual backups or restore testing (e.g., `global-max-snapshots-per-block-volume=12`)

If the following error is seen when creating a backup, the `global-max-snapshots-per-block-volume` needs to be adjusted:
```yaml
name: /prometheus-kube-prometheus-stack-prometheus-0 message: /Error backing up item error: /error
executing custom action (groupResource=volumesnapshots.snapshot.storage.k8s.io, namespace=monitoring,
name=velero-prometheus-kube-prometheus-stack-prometheus-db-prom2n67g): rpc error: code = Unknown desc
= CSI got timed out with error: Failed to check and update snapshot content:\n failed to take snapshot
of the volume 6e908637-1c40-41ab-a65b-0460b403e364: "rpc error: code = FailedPrecondition desc =\n the
number of snapshots on the source volume 6e908637-1c40-41ab-a65b-0460b403e364 reaches the configured
maximum (3)"
```

## Create a VolumeSnapshotClass
In addition to the above CSI driver overrides, a `VolumeSnapshotClass` must be defined to tell Velero how to create snapshots. This can be achieved by creating a velero-config Zarf package that contains the VolumeSnapshotClass manifest, and having your uds-bundle.yaml deploy this package. The `VolumeSnapshotClass` defines the driver, which in the below example is vSphere.

Example `VolumeSnapshotClass` deployment:
```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: vsphere-csi-snapshot-class
  labels:
    velero.io/csi-volumesnapshot-class: "true"
driver: csi.vsphere.vmware.com
deletionPolicy: Retain
```

## Configure Velero for CSI Support
In the uds-bundle.yaml Velero overrides, you must `EnableCSI`, set `snapshotsEnabled` to `true`, define the `volumeSnapshotLocation` as the CSI driver, and set `snapshotVolumes` to `true`. 

Example uds-bundle.yaml core-backup-restore layer overrides:

```yaml
    overrides:
      velero:
        velero:
          values:
            - path: configuration.features
              value: EnableCSI
            - path: snapshotsEnabled
              value: true
            - path: configuration.volumeSnapshotLocation
              value:
                - name: default
                  provider: velero.io/csi
            - path: schedules.udsbackup.template.snapshotVolumes
              value: true
```

## Additional Tips
- When restoring specific namespaces, always use the `--include-namespaces` flag to avoid creating unnecessary VolumeSnapshotContents:
    ```
    velero restore create --from-backup <backup-name> --include-namespaces <namespace>
    ```
- Be cautious when deleting backups that have been used for restores, as this may attempt to delete VolumeSnapshotContents that are still in use by restored volumes.
- Velero's garbage collection runs hourly by default. Ensure your TTL settings allow enough time for cleanup before hitting snapshot limits.
- The [pyvmomi-community-samples](https://github.com/vmware/pyvmomi-community-samples/tree/master) repo contains several scripts that are useful for interacting with the vSphere client. In particular, the [fcd_list_vdisk_snapshots](https://github.com/vmware/pyvmomi-community-samples/blob/master/samples/fcd_list_vdisk_snapshots.py) script allows you to list snapshots stored in vSphere, even when they can't be directly viewed in the vSphere UI. This comes in handy when snapshots and VolumeSnapshotContents get manually deleted from the cluster, but are not cleaned up appropriately in vSphere.

## Resources
[Velero CSI Snapshot Support](https://velero.io/docs/main/csi/)

[Kubernetes CSI Snapshot API](https://kubernetes.io/docs/concepts/storage/volume-snapshots/)

[Rancher vSphere](https://github.com/rancher/vsphere-charts/tree/main)

[Rancher vSphere Configuration Reference](https://rke.docs.rancher.com/config-options/cloud-providers/vsphere/config-reference)

[global-max-snapshots-per-block-volume](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/container-storage-plugin/3-0/getting-started-with-vmware-vsphere-container-storage-plug-in-3-0/using-vsphere-container-storage-plug-in/volume-snapshot-and-restore/volume-snapshot-and-restor-0.html#:~:text=For%20a%20better%20performance%2C%20use,default%20is%20set%20to%20three)

[How Velero Works](https://velero.io/docs/main/how-velero-works/)

