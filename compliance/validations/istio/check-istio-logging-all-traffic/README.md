# README.md

**NAME** - check-istio-logging-all-traffic

**INPUT** - This validation collects the Istio Mesh Configuration from the `istio-system` namespace.

**POLICY** - This policy checks if Istio's Mesh Configuration has logging enabled by verifying if the access log file is set to `/dev/stdout`.

**NOTES** - Ensure that the Istio Mesh Configuration is correctly set up in the `istio-system` namespace. The policy specifically looks for the `accessLogFile` field to be set to `/dev/stdout`.