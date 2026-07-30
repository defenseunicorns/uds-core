# K3d + UDS Core Slim Dev Checkpoint

This is a special Zarf package that takes a running K3d cluster (named `uds`) and wraps its committed container and volumes into a zarf package.

> [!CAUTION]
> *KNOWN ISSUE*: ARM64 builds of this package do not properly enforce network policies in GitHub CI. There may be additional unexpected behavior and issues with ARM64 builds.

## Creating this package

1. Set up a K3d cluster (named `uds`) containing the contents you'd like to checkpoint

> [!NOTE]
> The intent for this package is that those contents are the `uds dev stack`, `zarf init` and the `core-slim-dev` package (`core-base` and `core-identity-authorization`).

2. Run `uds zarf package create packages/checkpoint-dev --confirm`

## Deploying this package

```sh
uds zarf package deploy <path-to-zarf-tarball> --confirm
```

> [!NOTE]
> The pre-reqs for this package are the same as `uds-k3d` and you do not need to have a cluster running prior to deploying it.

> [!NOTE]
> **OrbStack users**: If you experience intermittent networking issues, configure a fixed Docker subnet. Navigate to **Settings → Docker → Docker Engine** and add the following to the engine config:

```json
{
  "default-address-pools": [
    {"base": "172.18.0.0/16", "size": 24}
  ]
}
```
