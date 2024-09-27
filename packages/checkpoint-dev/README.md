# K3d + UDS Core Slim Dev Checkpoint

This is a special modified version of UDS Core that rehydrates K3d + UDS Core Slim Dev from a committed container and volumes.

> [!IMPORTANT]
> In order to `zarf package create` this package you must have a running UDS k3d cluster with the UDS Core Slim dev installed in it!  This package also requires `sudo` to create and deploy currently - if you see a prompt and it seems stalled it is waiting for password input (hidden by the spinner)
