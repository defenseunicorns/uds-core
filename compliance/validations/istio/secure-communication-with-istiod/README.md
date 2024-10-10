# README.md

**NAME** - secure-communication-with-istiod

**INPUT** - This validation collects NetworkPolicy resources from all namespaces in the Kubernetes cluster.

**POLICY** - This policy checks that NetworkPolicies are correctly configured for istiod egress in the required namespaces. Specifically, it verifies that the NetworkPolicies have the expected port (15012) and protocol (TCP) for istiod egress. It also ensures that these configurations are present in the required namespaces and not in any improper namespaces.

**NOTES** - The required namespaces for the NetworkPolicies are: "authservice", "grafana", "keycloak", "loki", "metrics-server", "monitoring", "neuvector", "promtail", "velero".
