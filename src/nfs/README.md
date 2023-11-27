# NFS Provisioner

The NFS Provisioner provides a simple non-production-ready RWX storage class.

## Building/Deploying

Due to NFS requirements you will need a custom k3s docker image with the nfs tools installed. You can build this locally with:
```console
docker build -t k3s-nfs:0.0.1 .
```

Then to spin up a k3d cluster:
```console
zarf p deploy oci://ghcr.io/defenseunicorns/packages/uds-k3d:0.1.12-multi --set K3D_IMAGE=k3s-nfs:0.0.1 --confirm
```

To deploy NFS:
```console
zarf p create --confirm
zarf init --confirm # If you haven't already init-ed
zarf p deploy zarf-package-uds-core-nfs-provisioner-* --confirm
```

## Test/Validate

Validate with `uds run -f validate.yaml run` which spins up multiple read/write pods with the same volume and validates they can run. You can view the log output to confirm they are all reading/writing to the same volume.
