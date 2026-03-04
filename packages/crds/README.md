# UDS Core CRDs

This layer provides the standalone UDS Core Custom Resource Definitions:
- Package (`packages.uds.dev`)
- Exemption (`exemptions.uds.dev`)
- ClusterConfig (`clusterconfigs.uds.dev`)

This layer has no dependencies and can be deployed before any other UDS Core layer.

## Use Case

Deploy this layer when you have cluster components (e.g., load balancer controllers, storage providers) that need UDS policy exemptions but must be installed before UDS Core Base. By deploying CRDs first, you can create `Exemption` resources alongside those components, preventing policy violations when UDS Core's policy engine starts.
