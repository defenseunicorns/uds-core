# Core Shim Bundle

The Core Shim bundle is used exclusively in dev/CI testing to deploy the latest version of Core for a specific flavor, with some overrides. By using a bundle we have access to set values for testing that are more complex (maps and lists) and cannot be currently handled with Zarf variables. In particular this is required for setting the `additionalIgnoredNamespaces` value (to ignore the `uds-dev-stack` namespace) since this value is an array.

This bundle is dynamically modified by the `latest-package-release` task in `tasks/deploy.yaml` to properly set the repository and version reference based on the specific flavor.

This shim bundle should be replaced by proper Zarf variables once [ZEP 0021](https://github.com/zarf-dev/proposals/tree/main/0021-zarf-values) is fully implemented.
