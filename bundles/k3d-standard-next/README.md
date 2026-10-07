# UDS Core K3d standard bundle - CLI Next

This directory contains the UDS CLI Next source for the K3d standard demo bundle.

- `bundle.uds.hcl` defines the published `k3d-core-demo-next` bundle.
- `bundle-no-portal.uds.hcl` defines the no-Portal variant used for registry1 builds.
- `defaults.uds.hcl` contains bundle defaults.
- `config-*.uds.hcl` files contain runtime and test configuration.
- `values/` contains templated Zarf values for functional layer packages.

The Legacy bundle source remains in `bundles/k3d-standard/`.
