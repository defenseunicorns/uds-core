# Local Path RWX

Local path provides a simple **NOT FOR PRODUCTION** RWX storage class for k3d deployments in CI/Dev.

## Building/Deploying

Spin up a k3d cluster, disabling the default local-storage deployment and enabling our custom local path provisioner via an auto-deploy mount:
```console
k3d cluster create -v "$(pwd)/local-path-provisioner.yaml:/var/lib/rancher/k3s/server/manifests/local-path-provisioner.yaml@server:*" --k3s-arg "--disable=local-storage@server:*"
```

Note that the only change in the custom manifest was the modification of `config.json` to this:
```json
    {
      "sharedFileSystemPath":"/var/lib/rancher/k3s/storage"
    }
```

## Test/Validate

Validate with `uds run -f validate.yaml run` which spins up multiple read/write pods with the same volume and validates they can run. You can view the log output to confirm they are all reading/writing on the same volume.

## Multi-node

By mounting the same hostpath to all nodes, at the location that the local-path-provisioner will be using, we can make this work with multi-node k3d as well:
```console
mkdir -p /tmp/k3d # This will be our hostpath for the storage location
k3d cluster create -v "$(pwd)/local-path-provisioner.yaml:/var/lib/rancher/k3s/server/manifests/local-path-provisioner.yaml@server:*" --k3s-arg "--disable=local-storage@server:*" -v "/tmp/k3d:/var/lib/rancher/k3s/storage@all" --agents 2
```

Timing can get a little clunky with this, but it does work to support multi-node.
