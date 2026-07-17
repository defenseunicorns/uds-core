# Base Shim Bundle

The Base Shim bundle is used exclusively in dev/CI testing to provide a baseline bundle with access to overrides. By using a bundle we have access to set values for testing that are more complex (maps and lists) and cannot be currently handled with Zarf variables.

For direct package deployments, use [Zarf Values](https://docs.zarf.dev/ref/examples/values-templating/) for structured overrides such as maps and lists. Use [Zarf Variables](https://docs.zarf.dev/ref/examples/variables/) for deploy-time inputs that do not require structured values.
