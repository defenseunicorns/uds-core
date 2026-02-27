---
title: Group Based Authorization
---
<!-- @lulaStart 4147b6a6-3339-4d5d-b10a-f16502b52555 -->
Group-based authorization allows to control access to a specific application based on User Group membership. UDS Core is configured to support the following Groups (see [User Groups](/reference/configuration/single-sign-on/overview/#user-groups) for more details):

| Keycloak Group | UDS Group Name      | Purpose                    |
|----------------|---------------------|----------------------------|
| `Admin`        | `/UDS Core/Admin`   | Defined for Administrators |
| `Auditor`      | `/UDS Core/Auditor` | Defined for regular Users  |

The `/` character is used to define group hierarchy in Keycloak. To include it as part of a group name, escape it with a `~`, for example: `a~/b~/c`.

Below is an example to configure authorization based on the `Admin` (`/UDS Core/Admin`) Group:
<!-- @lulaEnd 4147b6a6-3339-4d5d-b10a-f16502b52555 -->
```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: httpbin-other
  namespace: authservice-test-app
spec:
  sso:
    - name: Demo SSO
      clientId: uds-core-httpbin
      redirectUris:
        - "https://protected.uds.dev/login"
      enableAuthserviceSelector:
        app: httpbin
      groups:
        anyOf:
          - "/UDS Core/Admin"
```

:::note
More information about the specification might be found in the [UDS Package CR](/reference/configuration/custom-resources/packages-v1alpha1-cr/#groups).
:::
