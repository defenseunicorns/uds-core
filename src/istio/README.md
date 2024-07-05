# Istio

A powerful service mesh tool that provides traffic management, load balancing, security, and observability features.

## Gateways

UDS Core provides a few Istio [Gateway](https://istio.io/latest/docs/reference/config/networking/gateway/) resources to allow ingress into the service mesh. Each one serves a different purpose and can be used to route traffic to different services.

1. **(Required)** Tenant Gateway - This gateway provides ingress to typical end-user applications. By default, UDS Core deploys a few services on this gateway, such as the Keycloak SSO portal. This gateway is typically exposed to end users of the applications deployed on top of UDS Core.
2. **(Required)** Admin Gateway - This gateway provides ingress to admin-related applications that are not for use by the default end user. By default, UDS Core deploys a few services on this gateway, such as the Admin Keycloak interface. This gateway is typically accessible to admins of the applications deployed on top of UDS Core. *Since the Admin and Tenant Gateways are logically separated, it is possible to have different security controls on each gateway.*
3. **(Optional)** Passthrough Gateway - This gateway allows mesh ingress without TLS termination performed by Istio. This could be useful for applications that need to (or currently) handle their own TLS termination. This gateway used to be a default component of UDS Core but is no longer deployed by default. To deploy this gateway, you must specify `istio-passthrough-gateway` as an `optionalComponent` in your UDS Bundle configuration.
