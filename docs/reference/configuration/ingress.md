---
title: Istio Ingress
---

UDS Core leverages Istio for ingress into the service mesh. This document provides an overview and examples of the Istio resources that UDS Core deploys to handle ingress.

## Gateways

UDS Core provides a few Istio [Gateway](https://istio.io/latest/docs/reference/config/networking/gateway/) resources to allow ingress into the service mesh. Each one serves a different purpose and can be used to route traffic to different services.

1. **(Required)** Tenant Gateway - This gateway provides ingress to typical end-user applications. By default, UDS Core deploys a few services on this gateway, such as the Keycloak SSO portal. This gateway is typically exposed to end users of the applications deployed on top of UDS Core.
2. **(Required)** Admin Gateway - This gateway provides ingress to admin-related applications that are not for use by the default end user. By default, UDS Core deploys a few services on this gateway, such as the Admin Keycloak interface. This gateway is typically accessible to admins of the applications deployed on top of UDS Core. *Since the Admin and Tenant Gateways are logically separated, it is possible to have different security controls on each gateway.*
3. **(Optional)** Passthrough Gateway - This gateway allows mesh ingress without TLS termination performed by Istio. This could be useful for applications that need to (or currently) handle their own TLS termination. This gateway used to be a default component of UDS Core but is no longer deployed by default. To deploy this gateway, you must specify `istio-passthrough-gateway` as an `optionalComponent` in your UDS Bundle configuration.

:::note
The default gateways provided with UDS Core only support HTTP/HTTPS ingress. If you need other TCP ingress for a service (ex: SSH ingress) this can be done by adding additional resources/configuration to UDS Core (see [this document](https://uds.defenseunicorns.com/reference/configuration/non-http-ingress/) for a guide). UDP Ingress is [not currently supported with Istio](https://github.com/istio/istio/issues/1430) and would need to be managed via a separate ingress path.
:::

### Enable Passthrough Gateway

In order to enable the Passthrough Gateway, you must specify `istio-passthrough-gateway` as an `optionalComponent` in your UDS Bundle configuration. Here is an example of how to do this:

```yaml
kind: UDSBundle
metadata:
  name: core-with-passthrough
  description: A UDS example bundle for packaging UDS core with the passthrough gateway enabled
  version: "0.0.1"

packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.23.0-upstream
    # You must specify the istio-passthrough-gateway as an optionalComponent or else it will not be deployed
    optionalComponents:
      - istio-passthrough-gateway
```

### Configure Domain Name and TLS for Istio Gateways

By default, the UDS Core Istio Gateways are set up to use the `uds.dev` (tenant/passthrough) and `admin.uds.dev` (admin) domains with valid TLS certificates.  You will need to change the domain name for your environment and provide a valid TLS certificate for your domain(s).

You can set the TLS certs via overrides in a [UDS Bundle](https://uds.defenseunicorns.com/structure/bundles/) (see below). UDS Core Istio Gateways default to only supporting TLS v1.3, but this can also be overridden per gateway if clients use TLS 1.2 (as seen in the tenant gateway example `value` below).

```yaml
kind: UDSBundle
metadata:
  name: core-with-cert-override
  description: A UDS example bundle for packaging UDS core with a custom TLS certificate
  version: "0.0.1"

packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.23.0-upstream
    overrides:
      istio-admin-gateway:
        uds-istio-config:
          values:
            - path: tls.supportTLSV1_2
              value: true # Add support for TLS 1.2 on this gateway, can be specified via variables if needed at deploy time
          variables:
            - name: ADMIN_TLS_CERT
              description: "The TLS cert for the admin gateway (must be base64 encoded)"
              path: tls.cert
            - name: ADMIN_TLS_KEY
              description: "The TLS key for the admin gateway (must be base64 encoded)"
              path: tls.key
      istio-tenant-gateway:
        uds-istio-config:
          variables:
            - name: TENANT_TLS_CERT
              description: "The TLS cert for the tenant gateway (must be base64 encoded)"
              path: tls.cert
            - name: TENANT_TLS_KEY
              description: "The TLS key for the tenant gateway (must be base64 encoded)"
              path: tls.key
```

You can then either use environment variables (`UDS_ADMIN_TLS_CERT`, `UDS_ADMIN_TLS_KEY`, `UDS_TENANT_TLS_CERT`, and `UDS_TENANT_TLS_KEY`) or a config file to configure the certs for each gateway. These values should be base64 encoded strings of the TLS certificate and key for the admin and tenant gateways respectively.

:::note
The `TLS_CERT` configuration values must include your specific domain certificate (e.g., `*.uds.dev`) **and** the full certificate chain leading up to a trusted root Certificate Authority (CA), concatenated together. Failing to include the full chain can result in unexpected behavior with certain applications, as some container images may not inherently trust intermediate certificates.
:::

Domain should be set via your [uds-config](https://uds.defenseunicorns.com/reference/cli/quickstart-and-usage/#variables-and-configuration) file using the shared key to override the Zarf Domain Variable (see example `uds-config.yaml` below). By default the `admin_domain` will be set to `admin.<DOMAIN>` but can be overridden to host admin services on a different domain.

```yaml
shared:
  domain: yourawesomedomain.com # shared across all packages in a bundle
  admin_domain: youradmindomain.com # optional, defaults to admin.yourawesomedomain.com

# TLS Certs/Keys if not provided via environment variables
variables:
  core:
    admin_tls_cert: # base64 encoded admin cert here
    admin_tls_key: # base64 encoded admin key here
    tenant_tls_cert: # base64 encoded tenant cert here
    tenant_tls_key: # base64 encoded tenant key here
```

:::note
If you are using Private PKI or self-signed certificates for your tenant certificates it is necessary to additionally configure `UDS_CA_CERT` with additional [trusted certificate authorities](/reference/configuration/single-sign-on/trusted-ca/).
:::

#### Configuring TLS from a Secret

As an alternative to specifying individual certificate, key, and CA certificate values, you can set `tls.credentialName` in the gateway configuration. This field specifies the name of a Kubernetes secret containing the TLS certificate, key, and optional CA certificate for the gateway. When `tls.credentialName` is set, it will override `tls.cert`, `tls.key`, and `tls.cacert` values, simplifying the configuration by allowing a direct reference to a Kubernetes TLS secret. This secret should be placed in the same namespace as the gateway resource. See [Gateway ServerTLSSettings](https://istio.io/latest/docs/reference/config/networking/gateway/#ServerTLSSettings) for all required and available secret keys.

This approach is useful if you already have a Kubernetes secret that holds the necessary TLS data and want to use it directly.

```yaml
kind: UDSBundle
metadata:
  name: core-with-credentialName
  description: A UDS example bundle for packaging UDS core with a custom TLS credentialName
  version: "0.0.1"

packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.23.0-upstream
    overrides:
      istio-admin-gateway:
        uds-istio-config:
          values:
            - path: tls.credentialName
              value: admin-gateway-tls-secret # Reference to the Kubernetes secret for the admin gateway's TLS certificate
      istio-tenant-gateway:
        uds-istio-config:
          values:
            - path: tls.credentialName
              value: tenant-gateway-tls-secret # Reference to the Kubernetes secret for the tenant gateway's TLS certificate
```

### Apex (Root) Domain Configuration
By default, the UDS Core Gateways are configured with wildcard hosts (for example, `*.uds.dev`), which match only subdomains (such as `demo.uds.dev` or `keycloak.admin.uds.dev`). The apex domain (i.e. `uds.dev`) is not covered by a wildcard. This is important if you need an application to be accessible at the root of your domain.

To support this use case, UDS Core provides an optional configuration to enable a dedicated server block for the apex domain. When enabled, two additional server blocks are added to your Istio Gateway:
- **HTTP on port 80**: Redirects traffic to HTTPS.
- **HTTPS on port 443**: Terminates TLS using settings from the rootDomainTLS section.

If you want your application to be reachable at `https://uds.dev`, enable apex (root) domain configuration via a bundle override in your UDS Bundle. For example:
```yaml
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.23.0-upstream
    overrides:
      istio-tenant-gateway:
        uds-istio-config:
          variables:
            - path: enableRootDomain
              value: true
            - path: rootDomainTLS.mode
              value: SIMPLE
            - path: rootDomainTLS.credentialName
              value: ""  # Leave blank to auto-create the secret using the provided cert data.
            - path: rootDomainTLS.supportTLSV1_2
              value: true
            - path: rootDomainTLS.cert
              value: "BASE64_ENCODED_CERTIFICATE"
            - path: rootDomainTLS.key
              value: "BASE64_ENCODED_PRIVATE_KEY"
            - path: rootDomainTLS.cacert
              value: "BASE64_ENCODED_CERTIFICATE"
```
:::note
- If you provide a non-empty value for credentialName, UDS Core assumes that you have pre-created the Kubernetes secret and will not auto-generate it using the certificate data.

- If you prefer to use an existing secret (such as when using a SAN certificate that covers both subdomains and the apex) you may set the `rootDomainTLS.credentialName` field to the name of that secret (for example, `gateway-tls`). In that case, UDS Core assumes the secret exists and will not auto-create one using the certificate data.
:::

#### Exposing a Service on the Apex Domain with a VirtualService
Once your apex domain configuration is enabled and DNS is correctly set up (i.e. an A record for `uds.dev` points to your ingress gateway), you can expose services directly on the apex domain. For example, to route traffic from `https://uds.dev/my-app` to a service in your cluster, create a VirtualService similar to the following:
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: my-app
  namespace: my-namespace
spec:
  hosts:
    - uds.dev
  # If your gateway is deployed in a different namespace, fully qualify it:
  gateways:
    - istio-tenant-gateway/tenant-gateway
  http:
    - match:
        - uri:
            prefix: /my-app
      rewrite:
        uri: "/"  # Optionally strip the /my-app prefix before forwarding
      route:
        - destination:
            host: my-app-service
            port:
              number: 80
```
This VirtualService matches requests to the apex domain (`uds.dev`) with the path prefix `/my-app` and routes them to your service (`my-app-service` on port 80).
