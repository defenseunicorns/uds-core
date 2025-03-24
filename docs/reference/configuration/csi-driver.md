<!-- > as noted in the [Velero documentation](https://velero.io/docs/main/csi/#prerequisites) - VolumeSnapshotLocation, VolumeSnapshotClass, etc.
> as well as switching `snapshotVolume` to `true` in the backup config. -->

NOTE: As of version release-1.14, the velero-plugin-for-csi is included in Velero

NOTE: You are not required to install the [velero-plugin-for-vsphere](https://github.com/vmware-tanzu/velero-plugin-for-vsphere) as you can simply use the Kubernetes snapshot controller

NOTE: Velero CSI Documentation: https://velero.io/docs/main/csi/

The following instructions are specific to an RKE2 cluster, and assume bucket variables required for S3 object storage have already been set:

To integrate Velero with a CSI driver, you should install both [rancher-vsphere-cpi](https://github.com/rancher/vsphere-charts/tree/main/charts/rancher-vsphere-cpi) and [rancher-vsphere-csi](https://github.com/rancher/vsphere-charts/tree/main/charts/rancher-vsphere-csi).

`blockVolumeSnapshot` must be enabled to allow the CSI driver to create snapshots of volumes
`global-max-snapshots-per-block-volume` should be added as an override to allow control of how many snapshots are allowed per volume. The default is 3, however when using the uds-core backup schedule with TTL of 10 days, the max of 3 will quickly be met, and further backups will fail. To allow 10 days worth of uds backups, with a buffer of 2 days, set the `global-max-snapshots-per-block-volume` to 12. You are not able to directly override this setting, thus you must override the entire secret config.

```
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

In addition to the above driver overrides, you must create a `volumeSnapshotClass`.
```
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: vsphere-csi-snapshot-class
  labels:
    velero.io/csi-volumesnapshot-class: "true"
driver: csi.vsphere.vmware.com
deletionPolicy: Retain
```

This can be achieved by creating a velero-config Zarf package that contains the veleroSnapshotClass, and having your uds-bundle.yaml deploy this package. 

In the uds-bundle.yaml Velero overrides, you must `EnableCSI`, set `snapshotsEnabled` to `true`, define the `volumeSnapshotLocation` as the CSI driver, and set `snapshotVolumes` to `true`. 

```
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
