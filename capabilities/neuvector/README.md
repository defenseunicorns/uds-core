## Welcome to the UDS Capability Neuvector!

1. Update [CHANGELOG.md](CHANGELOG.md), [DEVELOPMENT_MAINTENANCE.md](docs/DEVELOPMENT_MAINTENANCE.md)
1. Populate [README.md](README.md)
1. Add [manifests](manifests/), [values](values/), [pepr modules](pepr/), and [docs](docs/)
1. Complete [zarf.yaml](zarf.yaml)
1. Flesh out the [pipeline](../../.github/)
1. Update the [renovate.json](renovate.json) to match your dependencies
1. Delete this section

***

# [CAPABILITY REPOSITORY NAME]

[Short description]

## Prerequisites

1. zarf >= 0.30.1
2. docker or alternative
3. k3d

## Create

1. Assuming you are already in the directory with this README.md, cd into .github/zarf-runner/
2. run zarf p c . --confirm to deploy a test k3d cluster with istio and deploy neuvector

## Deploy

 [Steps used to deploy the UDS Capability]

## Remove

[Steps used to remove the UDS Capability]
