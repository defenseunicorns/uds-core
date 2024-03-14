## Velero

https://velero.io/

## Deployment Prerequisites

### Resources

- k3d installed on machine

#### Object Storage

S3 compatible object storage must be available in order to use this package. Bucket information and access credentials can be provided via configuration values / env vars:

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

## Plugin Compatability
This package currently assumes the availability of S3 API compatible object storage. As such, only the AWS specific plugin image is included. More information about all available plugins [can be found in the upstream docs](https://velero.io/plugins/). Ironbank includes images for Azure and the generic CSI driver, but those are currently excluded from this package. We may revisit package defaults at some point in the future depending on usage and user requests.

## Deploy

### Build and Deploy Everything locally via UDS tasks

```bash
# build the bundle for testing
UDS_PKG=velero uds run create-single-package

# setup a k3d test env
uds run setup-test-cluster

# deploy the bundle
UDS_PKG=velero uds run deploy-single-package
```

### Test the package via UDS tasks
Running the following will check that the velero deployment exists in the cluster and attempt to execute a backup:
```bash
uds run -f src/velero/tasks.yaml validate
```
> Alternatively, you can combine package creation, cluster setup, package deploy and the test command with a simple `UDS_PKG=velero uds run test-single-package`

## Manually trigger the default backup for testing purposes
```
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
