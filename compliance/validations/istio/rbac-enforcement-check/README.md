# README.md

**NAME** - istio-rbac-enforcement-check

**INPUT** - This validation collects AuthorizationPolicy resources from all namespaces in the Kubernetes cluster.

**POLICY** - This policy checks that Istio RBAC is enforced by ensuring that AuthorizationPolicy resources are present in the cluster.

**NOTES** - Ensure that the AuthorizationPolicy resources are correctly specified in the policy. The policy will fail if no AuthorizationPolicy resources are found.