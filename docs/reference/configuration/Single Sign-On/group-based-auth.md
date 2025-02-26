---
title: Group Based Authorization
---

Group-based authorization allows to control access to a specific application based on User Group membership. UDS Core is configured to support the following Groups (see [User Groups](http://google.com) for more details):

| Keycloak Group | UDS Group Name      | Purpose                    |
|----------------|---------------------|----------------------------|
| `Admin`        | `/UDS Core/Admin`   | Defined for Administrators |
| `Auditor`      | `/UDS Core/Auditor` | Defined for regular Users  |

Below is an example to configure authorization based on the `Admin` (`/UDS Core/Admin`) Group:

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
