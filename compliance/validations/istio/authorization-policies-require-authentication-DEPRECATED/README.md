# README.md

**NAME** - istio-authorization-policies-require-authentication

**INPUT** - Collects the AuthorizationPolicy named `jwt-authz` in the `istio-system` namespace.

**POLICY** - Checks that the AuthorizationPolicy requires authentication by ensuring that `requestPrincipals` is defined and the `selector.protect` label is set to `keycloak`.

**NOTES** - Ensure that the AuthorizationPolicy exists and is correctly configured to require authentication for Keycloak.