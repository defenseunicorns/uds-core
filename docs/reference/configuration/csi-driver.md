<!-- > as noted in the [Velero documentation](https://velero.io/docs/main/csi/#prerequisites) - VolumeSnapshotLocation, VolumeSnapshotClass, etc.
> as well as switching `snapshotVolume` to `true` in the backup config. -->

---
title: CSI Driver
---

## Introduction
As of Velero v1.14, the velero-plugin-for-csi is included in Velero. This means you are not required to install a separate velero-plugin-for-csi or the [velero-plugin-for-vsphere](https://github.com/vmware-tanzu/velero-plugin-for-vsphere).

## Using a CSI driver in an RKE2 cluster
The following instructions are specific to an RKE2 cluster, and assume bucket variables required for S3 object storage have already been set. The below tips are not meant to be step-by-step instructions, but useful lessons learned when configuring the CSI driver. 

To integrate Velero with a CSI driver, you should install both [rancher-vsphere-cpi](https://github.com/rancher/vsphere-charts/tree/main/charts/rancher-vsphere-cpi) and [rancher-vsphere-csi](https://github.com/rancher/vsphere-charts/tree/main/charts/rancher-vsphere-csi).

### Key Overrides
- `blockVolumeSnapshot` must be enabled to allow the CSI driver to create snapshots of volumes via deploying the [csi-snapshotter](https://github.com/kubernetes-csi/external-snapshotter) sidecar
- `configTemplate` must be completely overridden, to allow overriding of the `global-max-snapshots-per-block-volume` setting
- `global-max-snapshots-per-block-volume` should be added as an override within the `configTemplate`, to allow control of how many snapshots are allowed per volume. 

## `global-max-snapshots-per-block-volume` Configuration
The default `global-max-snapshots-per-block-volume` is 3, however, when using the uds-core [backup schedule](https://github.com/defenseunicorns/uds-core/blob/main/src/velero/values/values.yaml#L35-L47) with TTL of 10 days, the max of 3 will quickly be met, and further backups will fail. Each `udsbackup` creates a total of 13 snapshots across the different volumes. 

The number of volumes your cluster has will determine what you need to set the `global-max-snapshots-per-block-volume` to, to account for 10 days worth of udsbackups. For example, if a cluster has 13 volumes, and each volume gets 1 snapshot during the nightly udsbackup (remember 13 snapshots are created per night), you should set `global-max-snapshots-per-block-volume` to a minimum of 10 (1 snapshot per volume per night x 10 days). 

To allow 10 days worth of udsbackups, with a buffer of 2 additional days (to allow room for any manually created backups), set the `global-max-snapshots-per-block-volume` to 12. 

Example rancher-vsphere-cpi and rancher-vsphere-csi deployment with overrides:

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
      datacenters: "Kitchen"
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
      datacenters: "Kitchen"
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
          datacenters = "Kitchen"
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

In addition to the above CSI driver overrides, you must create a `volumeSnapshotClass` that gets deployed to your cluster. This can be achieved by creating a velero-config Zarf package that contains the veleroSnapshotClass, and having your uds-bundle.yaml deploy this package. 

Example `volumeSnapshotClass` deployment:
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


In the uds-bundle.yaml Velero overrides, you must `EnableCSI`, set `snapshotsEnabled` to `true`, define the `volumeSnapshotLocation` as the CSI driver, and set `snapshotVolumes` to `true`. 

Example uds-bundle.yaml overrides:

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

## Resources
[Velero CSI Snapshot Support](https://velero.io/docs/main/csi/)

[Kubernetes CSI Snapshot API](https://kubernetes.io/docs/concepts/storage/volume-snapshots/)

[Rancher vSphere](https://github.com/rancher/vsphere-charts/tree/main)

[Rancher vSphere Configuration Reference](https://rke.docs.rancher.com/config-options/cloud-providers/vsphere/config-reference)

[global-max-snapshots-per-block-volume](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/container-storage-plugin/3-0/getting-started-with-vmware-vsphere-container-storage-plug-in-3-0/using-vsphere-container-storage-plug-in/volume-snapshot-and-restore/volume-snapshot-and-restor-0.html#:~:text=For%20a%20better%20performance%2C%20use,default%20is%20set%20to%20three)

[How Velero Works](https://velero.io/docs/main/how-velero-works/)

