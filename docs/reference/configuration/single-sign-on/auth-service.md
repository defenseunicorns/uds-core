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

## Limitations:
Authservice is intended for simple, basic protection scenarios where an absolute level of protection is acceptable. For more advanced authentication requirements, you should implement authentication directly in your application or via a more comprehensive solution.

## Ambient Mode Support

Authservice is fully supported for packages running in Istio Ambient Mesh mode (`spec.network.serviceMesh.mode: ambient`).

### How This Works
- When a Package CR specifies ambient mode and includes an SSO client with `enableAuthserviceSelector`, the UDS Operator will:
  - Automatically create and manage the necessary [waypoint proxy](https://istio.io/latest/docs/ambient/usage/waypoint/) resources for your application.
  - Monitor the health and readiness of the waypoint proxy before enabling Authservice protection.
  - Associate the waypoint proxy with the correct services based on your selector.
  - Clean up the waypoint and related configuration automatically when the package is deleted.

This enhancement removes the previous limitation and enables transparent authentication and authorization for ambient workloads protected by Authservice. No manual waypoint management is required.

**Usage:**
- Set `spec.network.serviceMesh.mode: ambient` in your Package CR.
- Add your SSO configuration with `enableAuthserviceSelector` as usual.
- The operator will handle the rest.
