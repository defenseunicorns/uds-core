# NFS Provisioner

The NFS Provisioner provides a simple **NOT FOR PRODUCTION** RWX storage class. The deployment is configured with no persistence and designed for dev use only.

## Building/Deploying

Spin up a k3d cluster and zarf init, example:
```console
zarf p deploy oci://ghcr.io/defenseunicorns/packages/uds-k3d:0.1.12-multi --confirm
zarf init --confirm
```

Build and deploy NFS provisioner:
```console
zarf p create --confirm
zarf p deploy zarf-package-uds-core-nfs-provisioner-* --confirm
```

## Test/Validate

Validate with `uds run -f validate.yaml run` which spins up multiple read/write pods with the same volume and validates they can run. You can view the log output to confirm they are all reading/writing on the same volume.
