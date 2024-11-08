# README.md

**NAME** - istio-prometheus-annotations-validation

**INPUT** - This validation collects all pods in the Kubernetes cluster.

**POLICY** - This policy checks that all pods have the required Prometheus annotations for scraping metrics, except for those in exempted namespaces.

**NOTES** - The exempted namespaces are "kube-system", "istio-system", "uds-dev-stack", and "zarf". Ensure that these namespaces are correct and update them if necessary.