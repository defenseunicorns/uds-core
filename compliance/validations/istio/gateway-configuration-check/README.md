# README.md

**NAME** - gateway-configuration-check

**INPUT** - This validation collects all Istio gateways in the Kubernetes cluster.

**POLICY** - This policy checks that only allowed gateways ("admin", "tenant", "passthrough") are present and that all required gateway types are found.

**NOTES** - Ensure that the allowed gateways are correctly specified and that all required gateway types are present in the cluster.