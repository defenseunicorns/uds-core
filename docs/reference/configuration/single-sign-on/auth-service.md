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
Authservice is intended for simple, basic protection scenarios where an absolute level of protection is acceptable (such as a Web UI or dashboard). For more advanced authentication requirements, you should implement authentication directly in your application or via a more comprehensive solution.

Authservice is currently not supported for ambient workloads (Package CR `network.serviceMesh.mode` of `ambient`). Package CRs with ambient configuration will be denied when applying if an Authservice SSO client is present. This restriction will be removed in the future once supported is added for this in the UDS Operator.
