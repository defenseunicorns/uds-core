## Authservice
`authservice` helps delegate the [OIDC Authorization Code Grant Flow](https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowAuth)
to the Istio mesh. `authservice` is compatible with any standard OIDC Provider as well as other Istio End-user Auth features,
including [Authentication Policy](https://istio.io/docs/tasks/security/authn-policy/) and [RBAC](https://istio.io/docs/tasks/security/rbac-groups/).
Together, they allow developers to protect their APIs and web apps without any application code required.

See the [Authservice Protection documentation](https://uds.defenseunicorns.com/reference/configuration/single-sign-on/auth-service/) for guidance on using the [UDS Package](https://uds.defenseunicorns.com/reference/configuration/uds-operator/package/) custom resource to generate Authservice chains.
