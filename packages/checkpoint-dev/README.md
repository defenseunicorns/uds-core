# K3d + UDS Core Slim Dev Checkpoint

This is a special Zarf package that takes a running K3d cluster (named `uds`) and wraps its committed container and volumes into a zarf package.

> [!CAUTION]
> This package does not currently work on macOS due to some limitations with filesystem permissions.  

> [!CAUTION]
> *KNOWN ISSUE*: ARM64 builds of this package do not properly enforce network policies in GitHub CI. There may be additional unexpected behavior and issues with ARM64 builds.

## Creating this package

In order to create this package you must follow the following:

1. Setup a K3d cluster (named `uds`) containing the contents you'd like to checkpoint

> [!NOTE]
> The intent for this package is that those contents are the `uds dev stack`, `zarf init` and the `core-slim-dev` package (`core-base` and `core-identity-authorization`).

2. Run `uds zarf package create <path-to-zarf-yaml> --confirm` on the Zarf Package in this directory

> [!IMPORTANT]
> This package requires `sudo` to create and deploy currently - if you see a prompt and it seems stalled it is waiting for password input (hidden by the spinner)

## Deploying this package

Once you have a package with the contents you want created you can deploy it with:

```
uds zarf package deploy <path-to-zarf-tarball> --confirm
```

> [!IMPORTANT]
> This package requires `sudo` to deploy and create currently - if you see a prompt and it seems stalled it is waiting for password input (hidden by the spinner)

> [!NOTE]
> The pre-reqs for this package are the same as `uds-k3d` and you do not need to have a cluster running prior to deploying it.
