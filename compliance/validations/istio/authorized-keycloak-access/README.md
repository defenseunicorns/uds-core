# README.md

**NAME** - istio-enforces-authorized-keycloak-access

**INPUT** - Collects the AuthorizationPolicy named `keycloak-block-admin-access-from-public-gateway` in the `keycloak` namespace.

**POLICY** - Checks that the AuthorizationPolicy restricts access to Keycloak admin by denying access from sources not in the `istio-admin-gateway` namespace to paths `/admin*` and `/realms/master*` on port `8080`.

**NOTES** - Ensure that the AuthorizationPolicy exists and is correctly configured to deny access to Keycloak admin as specified.