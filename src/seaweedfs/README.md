# Getting Started

This is very rough wip dev docs for a wip poc. ymmv

## Prereqs

1. zarf
1. uds cluster
1. aws cli (testing)

## Install

1. in terminal that you will deploy the cluster from run ```export K3D_FIX_MOUNTS=1```
1. Deploy your k3d cluster via ```uds run test-uds-core``` in the root of the repo
1. in this directory run ```zarf p c . --confirm``` to create the zarf package
1. Finally run ```zarf package deploy zarf-package-seaweedfs-* --confirm```
1. profit

## Testing

Get the aws access key and id from the s3 cluster secret named seaweedfs-s3-secret in the seaweed namespace. Secret data fields:
admin_access_key_id and admin_secret_access_key respectively.

```bash
# configure AWS
aws configure
# Enter the access key and id, other fields are irrelevant
# get s3 endpoint 
S3_ENDPOINT=$(zarf t k get vs -n weed -o jsonpath='{.items[*].spec.hosts[0]}')

# Make bucket
aws --endpoint-url https://$S3_ENDPOINT s3 mb s3://newbucket3

# List buckets (should be none)
aws --endpoint-url https://$S3_ENDPOINT s3 ls

...etc
```

### More info

See below references

1. https://github.com/seaweedfs/seaweedfs/wiki/AWS-CLI-with-SeaweedFS
1. https://github.com/seaweedfs/seaweedfs/wiki/AWS-IAM-CLI
1. https://github.com/seaweedfs/seaweedfs/wiki/weed-shell
1. https://github.com/seaweedfs/seaweedfs/wiki/Production-Setup
