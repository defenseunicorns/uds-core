## Authservice
`authservice` helps delegate the [OIDC Authorization Code Grant Flow](https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowAuth)
to the Istio mesh. `authservice` is compatible with any standard OIDC Provider as well as other Istio End-user Auth features,
including [Authentication Policy](https://istio.io/docs/tasks/security/authn-policy/) and [RBAC](https://istio.io/docs/tasks/security/rbac-groups/).
Together, they allow developers to protect their APIs and web apps without any application code required.

See [IDAM.md](../../docs/IDAM.md) for guidance on using the [UDS Package](../pepr/operator/README.md) custom resource to generate Authservice chains.

### Changes from the DoD Platform One Big Bang package

This package differs from the [DoD Platform One Big Bang package](https://repo1.dso.mil/big-bang/product/packages/authservice) in a few key ways:

* Leverages the [authservice-go](https://github.com/tetrateio/authservice-go) project which is the successor to the original [authservice](https://github.com/istio-ecosystem/authservice) project.
