# Base Shim Bundle

The Base Shim bundle is used exclusively in dev/CI testing to provide a baseline bundle with access to overrides. By using a bundle we have access to set values for testing that are more complex (maps and lists) and cannot be currently handled with Zarf variables. In particular this is required for setting the `additionalIgnoredNamespaces` value (to ignore the `uds-dev-stack` namespace) since this value is an array.

This shim bundle should be replaced by proper Zarf variables once [ZEP 0021](https://github.com/zarf-dev/proposals/tree/main/0021-zarf-values) is fully implemented.
