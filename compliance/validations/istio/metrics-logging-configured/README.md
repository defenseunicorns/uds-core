# README.md

**NAME** - istio-metrics-logging-configured

**INPUT** - This validation collects the "istioConfig" configmap in the "istio-system" namespace.

**POLICY** - This policy checks if metrics logging is supported by validating the Istio configuration.

**NOTES** - Ensure that the Istio configmap is correctly configured and located in the "istio-system" namespace. The policy specifically looks for the `enablePrometheusMerge` field to be not set to `false`.