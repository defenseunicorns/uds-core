---
title: Authservice Protection
---

To enable authentication for applications that do not have native OIDC configuration, UDS Core can utilize Authservice as an authentication layer.

Follow these steps to protect your application with Authservice:

* Set `enableAuthserviceSelector` with a matching label selector in the `sso` configuration of the Package.
* Ensure that the pods of the application are labeled with the corresponding selector or use an empty selector to protect all of them

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: httpbin
  namespace: httpbin
spec:
  sso:
    - name: Demo SSO httpbin
      clientId: uds-core-httpbin
      redirectUris:
        - "https://httpbin.uds.dev/login"
      enableAuthserviceSelector:
        app: httpbin
```

:::note
The UDS Operator uses the first `redirectUris` to populate the `match.prefix` hostname and `callback_uri` in the authservice chain.
:::

For a complete example, see [app-authservice-tenant.yaml](https://github.com/defenseunicorns/uds-core/blob/main/src/test/app-authservice-tenant.yaml)

## Multiple Services and Selectors

### Protecting Multiple Services

You can protect multiple services with a single SSO client by using a common label selector. This is useful when you want to apply the same authentication rules to multiple related services.

#### Example: Single SSO Client for Multiple Services

```yaml
# This will protect all pods with the label 'app: myapp'
sso:
  - name: "My App Services"
    clientId: my-app-auth
    redirectUris: ["https://myapp.example.com/login"]
    enableAuthserviceSelector:
      app: myapp  # Matches all pods with label app=myapp
    groups:
      anyOf: ["/MyApp/Users"]
```

### Multiple SSO Configurations

If you need different authentication rules for different services, you can define multiple SSO clients with different selectors.

#### Example: Multiple SSO Clients

```yaml
sso:
  - name: "Admin Services"
    clientId: admin-auth
    redirectUris: ["https://admin-app.example.com/login"]
    enableAuthserviceSelector:
      app: admin
    groups:
      anyOf: ["/Admin"]

  - name: "User Services"
    clientId: user-auth
    redirectUris: ["https://app.example.com/login"]
    enableAuthserviceSelector:
      app: user
    groups:
      anyOf: ["/Users"]
```

:::note
When using `network.expose` with protected services:
- Each expose entry must map to exactly one SSO client
- Multiple services behind the same expose entry must share the same SSO configuration
- This limitation applies to both ambient and non-ambient modes
:::

## Limitations:
Authservice is intended for simple, basic protection scenarios where an absolute level of protection is acceptable (such as a Web UI or dashboard). For more advanced authentication requirements, you should implement authentication directly in your application or via a more comprehensive solution.

## Ambient Mode Support

Authservice is fully supported for packages running in Istio Ambient Mesh mode (`spec.network.serviceMesh.mode: ambient`).

### How This Works
- When a Package CR specifies ambient mode and includes an SSO client with `enableAuthserviceSelector`, the UDS Operator will:
  - Automatically create and manage the necessary [waypoint proxy](https://istio.io/latest/docs/ambient/usage/waypoint/) resources for your application.
  - Monitor the health and readiness of the waypoint proxy before enabling Authservice protection.
  - Associate the waypoint proxy with the correct services based on your selector.
  - Clean up the waypoint and related configuration automatically when the package is deleted.

**Usage:**
- Set `spec.network.serviceMesh.mode: ambient` in your Package CR.
- Add your SSO configuration with `enableAuthserviceSelector` as usual.
- The operator will handle the rest.

:::caution
### Important Note on Selector Matching
When using `enableAuthserviceSelector` in ambient mode, ensure that the selector matches the labels on your pods **and** is the same selector used by any services (`spec.selector`). If the selector matches pod labels but not the selector used by the service, you may encounter incomplete Authservice protection where:
  - The pod is mutated to use the waypoint
  - But the service is not properly associated with the waypoint

This will "fail closed" and result in traffic through the service being blocked, rather than routing through the expected SSO login flow.

Additionally, any package `network.expose` entries should use the same selector to allow traffic to flow properly from the gateway to the waypoint.
:::
