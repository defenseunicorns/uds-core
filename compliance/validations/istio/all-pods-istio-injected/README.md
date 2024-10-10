# README.md

**NAME** - all-pods-istio-injected

**INPUT** - Collects all pods in the Kubernetes cluster.

**POLICY** - Checks that all pods have an Istio sidecar proxy, except for pods in a predefined list of exempted namespaces.

**NOTES** - The exempted namespaces are: `kube-system`, `istio-system`, `uds-dev-stack`, `zarf`, `istio-admin-gateway`, `istio-tenant-gateway`, `istio-passthrough-gateway`.