# README.md

**NAME** - istio-health-check

**INPUT** - This validation collects the Istiod deployment and horizontal pod autoscaler (HPA) in the "istio-system" namespace.

**POLICY** - This policy checks if the Istiod deployment is healthy and if the HPA has sufficient replicas.

**NOTES** - Ensure that the Istiod deployment and HPA are correctly configured and running in the "istio-system" namespace.