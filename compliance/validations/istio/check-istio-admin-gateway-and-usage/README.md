# README.md

**NAME** - check-istio-admin-gateway-and-usage

**INPUT** - This validation collects the `admin-gateway` from the `istio-admin-gateway` namespace and all `virtualservices` from all namespaces.

**POLICY** - This policy checks if the `admin-gateway` exists in the `istio-admin-gateway` namespace and verifies that all admin virtual services are using the admin gateway.

**NOTES** - Ensure that the `admin-gateway` is correctly set up in the `istio-admin-gateway` namespace. The policy specifically looks for virtual services with names containing "admin" to be using the admin gateway.