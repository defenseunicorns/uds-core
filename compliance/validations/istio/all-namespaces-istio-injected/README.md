# README.md

**NAME** - all-namespaces-istio-injected

**INPUT** - Collects all namespaces in the Kubernetes cluster.

**POLICY** - Checks that all namespaces are Istio-injected, except for a predefined list of exempted namespaces.

**NOTES** - The exempted namespaces are: `istio-system`, `kube-system`, `default`, `istio-admin-gateway`, `istio-passthrough-gateway`, `istio-tenant-gateway`, `kube-node-lease`, `kube-public`, `uds-crds`, `uds-dev-stack`, `uds-policy-exemptions`, `zarf`.