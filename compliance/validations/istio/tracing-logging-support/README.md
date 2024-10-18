# README.md

**NAME** - istio-tracing-logging-support

**INPUT** - This validation collects the "istioConfig" configmap from the "istio-system" namespace.

**POLICY** - This policy checks that tracing logging is supported in the Istio configuration, specifically by verifying that the "defaultConfig.tracing" is not null and "zipkin.address" field is not empty.

**NOTES** - Ensure that the Istio ConfigMap is correctly specified in the policy. The policy will fail if tracing logging is not supported in the Istio configuration.