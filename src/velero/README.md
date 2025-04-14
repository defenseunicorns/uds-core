## Velero

https://velero.io/

## Deployment Prerequisites

### Resources

- k3d installed on machine

#### S3 Compatible Object Storage

Bucket information and access credentials can be provided via configuration values / env vars:

- Bucket ID: `ZARF_VAR_VELERO_BUCKET`
- Bucket Region: `ZARF_VAR_VELERO_BUCKET_REGION`
- Bucket Provider URL: `ZARF_VAR_VELERO_BUCKET_PROVIDER_URL`
- Access Key: `ZARF_VAR_VELERO_BUCKET_KEY`
- Access Key Secret: `ZARF_VAR_VELERO_BUCKET_KEY_SECRET`

As an alternative to providing the access key and secret via variable, you can reference a secret with the following format
```
apiVersion: v1
kind: Secret
metadata:
  name: ###ZARF_VAR_VELERO_BUCKET_CREDENTIALS_SECRET###
  namespace: velero
type: kubernetes.io/opaque
stringData:
  cloud: |-
    [default]
    aws_access_key_id=###ZARF_VAR_ACCESS_KEY###
    aws_secret_access_key=###ZARF_VAR_SECRET_KEY###
```

By overriding the velero values in the bundle as follows:
```
  - name: core
    overrides:
      velero:
        velero:
          values:
            - path: "credentials.existingSecret"
              value: "velero-bucket-credentials"
```

#### Azure Blob Storage

Blob information and access credentials can be provided by overriding bundle values:
```
  - name: core
    overrides:
      velero:
        velero:
          values:
            - path: credentials.secretContents.cloud
              value: |       
                AZURE_STORAGE_ACCOUNT_ACCESS_KEY=${VELERO_STORAGE_ACCOUNT_ACCESS_KEY}
                AZURE_CLOUD_NAME=${VELERO_CLOUD_NAME}
            - path: configuration.backupStorageLocation
              value:
                - name: default
                  provider: azure
                  bucket: ${VERLERO_BUCKET_NAME}
                  config: 
                    storageAccount:${VELERO_STORAGE_ACCOUNT}
                    resourceGroup:${VELERO_RESOURCE_GROUP}
                    storageAccountKeyEnvVar:VELERO_STORAGE_ACCOUNT_ACCESS_KEY
                    subscriptionId:${AZ_SUBSCRIPTION_ID}
```

## Plugin Compatibility

This package currently assumes the availability of S3 API compatible object storage, Azure blob storage or use of the CSI plugin which is baked into Velero by default. More information about all available plugins can be found in the upstream docs**[can be found in the upstream docs](https://velero.io/plugins/). 

## Deploy

### Build Deploy, and Test locally via UDS tasks

Velero is included in the backup-restore functional layer (WIP). This layer can be created, deployed, and tested with a single UDS run command:

```bash
uds run test-single-layer --set LAYER=backup-restore
```

## Manually trigger the default backup for testing purposes

```bash
velero backup create --from-schedule velero-udsbackup -n velero
```

> NOTE: requires [the velero CLI](https://velero.io/docs/v1.3.0/velero-install/)

Alternatively, manually create a `backup` object with `kubectl`:

```bash
uds zarf tools kubectl apply -f - <<-EOF
  apiVersion: velero.io/v1
  kind: Backup
  metadata:
    name: test-backup
    namespace: velero
  spec:
    csiSnapshotTimeout: 0s
    excludedNamespaces:
    - kube-system
    - flux
    - velero
    hooks: {}
    includeClusterResources: true
    itemOperationTimeout: 0s
    metadata: {}
    snapshotVolumes: false
    ttl: 240h0m0s
EOF
```

## Manually restore backup

```bash
velero restore create uds-restore-$(date +%s) \
  --from-backup <backup-name> \
  --include-namespaces <namespaces-to-restore> --wait
```

> [!NOTE]
> The default behavior of Velero will not recreate resources that already exist.
> If the intention is to restore data on a PV, the PV/PVC will have to be deleted
> before running the restore.

> [!NOTE]
> Additional configuration will be required to get CSI backed PVCs to be snapshotted. For more information on configuring CSI backed volumes, see https://uds.defenseunicorns.com/reference/configuration/backup-and-restore/vsphere-rke2-csi/

