---
title: Istio Ingress
sidebar:
  order: 4
---

UDS Core leverages Istio for ingress into the service mesh. This document provides an overview and examples of the Istio resources that UDS Core deploys to handle ingress.

## Gateways

UDS Core provides a few Istio [Gateway](https://istio.io/latest/docs/reference/config/networking/gateway/) resources to allow ingress into the service mesh. Each one serves a different purpose and can be used to route traffic to different services.

1. **(Required)** Tenant Gateway - This gateway provides ingress to typical end-user applications. By default, UDS Core deploys a few services on this gateway, such as the Keycloak SSO portal. This gateway is typically exposed to end users of the applications deployed on top of UDS Core.
2. **(Required)** Admin Gateway - This gateway provides ingress to admin-related applications that are not for use by the default end user. By default, UDS Core deploys a few services on this gateway, such as the Admin Keycloak interface. This gateway is typically accessible to admins of the applications deployed on top of UDS Core. *Since the Admin and Tenant Gateways are logically separated, it is possible to have different security controls on each gateway.*
3. **(Optional)** Passthrough Gateway - This gateway allows mesh ingress without TLS termination performed by Istio. This could be useful for applications that need to (or currently) handle their own TLS termination. This gateway used to be a default component of UDS Core but is no longer deployed by default. To deploy this gateway, you must specify `istio-passthrough-gateway` as an `optionalComponent` in your UDS Bundle configuration.

:::tip
- The default gateways provided with UDS Core only support HTTP/HTTPS ingress. For other TCP ingress needs (e.g., SSH), see [non-HTTP ingress](/reference/configuration/service-mesh/non-http-ingress/). UDP Ingress is [not currently supported with Istio](https://github.com/istio/istio/issues/1430).
- For specialized HTTP/HTTPS use cases (security requirements, IP-based access control, or additional domains), you can create [custom gateways](/reference/configuration/service-mesh/custom-gateways) to expose your services.
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
    ref: 0.54.1-upstream
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
    ref: 0.54.1-upstream
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
The `TLS_CERT` configuration values must include your specific domain certificate (e.g. `*.uds.dev`) **and** any intermediate certificates between your certificate and a trusted root Certificate Authority (CA) (the full "[certificate chain](https://csrc.nist.gov/glossary/term/certificate_chain)"). Failing to include intermediates in the chain can result in unexpected behavior with certain applications, as some container images may not inherently trust intermediate certificates.

The order of this full chain is very important: your server certificate (e.g. `*.uds.dev`) must come **first**, followed by any intermediates in order, and finally your root CA.
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
If you are using Private PKI or self-signed certificates for your tenant certificates it is necessary to additionally configure `UDS_CA_BUNDLE_CERTS` with additional [trusted certificate authorities](/reference/configuration/single-sign-on/trusted-ca/). You may also need to configure individual UDS Core components to trust your private CA - see the [Private PKI Configuration](/reference/configuration/trust-management/private-pki/) guide for details.
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
    ref: 0.54.1-upstream
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

### Root (Apex) Domain Configuration

By default, the UDS Core Gateways are configured with wildcard hosts (for example, `*.uds.dev`), which match only subdomains (such as `demo.uds.dev` or `keycloak.admin.uds.dev`). The root domain (i.e. `uds.dev`) is not covered by a wildcard. This is important if you need an application to be accessible at the root of your domain.

To support this use case, UDS Core provides an optional configuration to enable a dedicated server block for the root domain. When enabled, two additional server blocks are added to your Istio Gateway:
- **HTTP on port 80**: Redirects traffic to HTTPS.
- **HTTPS on port 443**: Terminates TLS using settings from the rootDomain.tls section.

If you want your application to be reachable at `https://uds.dev`, enable root (apex) domain configuration via a bundle override in your UDS Bundle. For example:
```yaml
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.54.1-upstream
    overrides:
      istio-tenant-gateway:
        uds-istio-config:
          values:
            - path: rootDomain.enabled
              value: true
            - path: rootDomain.tls.mode
              value: SIMPLE
            - path: rootDomain.tls.credentialName
              value: ""  # Leave blank to auto-create the secret using the provided cert data.
            - path: rootDomain.tls.supportTLSV1_2
              value: true
          variables:
            - path: rootDomain.tls.cert
              name: "ROOT_TLS_CERT"
            - path: rootDomain.tls.key
              name: "ROOT_TLS_KEY"
            - path: rootDomain.tls.cacert
              name: "ROOT_TLS_CACERT"
```
:::note
- If you provide a non-empty value for credentialName, UDS Core assumes that you have pre-created the Kubernetes secret and will not auto-generate it using the certificate data.

- If you prefer to use an existing secret (such as when using a SAN certificate that covers both subdomains and the root) you may set the `rootDomain.tls.credentialName` field to the name of that secret (for example, `gateway-tls`). In that case, UDS Core assumes the secret exists and will not auto-create one using the certificate data.
:::

#### Exposing a Service on the Root Domain

Once you have deployed with a valid root domain configuration and DNS is correctly set up (i.e. an A record for `uds.dev` points to your ingress gateway), you can expose a service directly on the root domain using the reserved `.` host in your Package CR. For example, to route traffic from `https://uds.dev/` to a service in your cluster, create a Package similar to the following:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-namespace
spec:
  network:
    expose:
      - service: my-app-service
        selector:
          app.kubernetes.io/name: my-app
        host: "."
        gateway: tenant
        port: 80
```

This VirtualService matches requests to the root domain (`uds.dev`) and routes them to your service (`my-app-service` on port 80).

### Using an L7 Load Balancers with UDS Core Gateways

UDS Core supports external TLS termination and custom client certificate headers for environments using external load balancers (e.g., AWS Application Load Balancer or Azure Application Gateway). This is achieved by overriding default Keycloak and Istio settings in your bundle configuration.

The configuration requires disabling HTTPS redirects in Istio Gateways and setting the number of trusted proxies to the number of proxies in front of the Istio Gateways (see [Configuring Gateway Network Topology](https://istio.io/latest/docs/ops/configuration/traffic-management/network-topologies/#configuring-network-topologies) Istio documentation for details). In the example below, an ALB is acting as the trusted proxy, therefore the `meshConfig.defaultConfig.gatewayTopology.numTrustedProxies` is set to 1. Changing this setting in runtime will trigger the UDS Operator to restart Istio Gateway Pods automatically. Keycloak configuration is then adjusted by deploying an additional `EnvoyFilter` that converts the Amazon ALB client certificate into a format that Keycloak can understand. The example below outlines the configuration needed to set up the [Amazon ALB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/mutual-authentication.html) for UDS Core:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      istio-tenant-gateway:
        uds-istio-config:
          values:
            - path: tls.servers.keycloak.enableHttpsRedirect
              value: false
            - path: tls.servers.tenant.enableHttpsRedirect
              value: false
#      # Uncomment the following settings if L7 Load Balancer is also used for the Admin Gateway
#      istio-admin-gateway:
#        uds-istio-config:
#          values:
#            - path: tls.servers.keycloak.enableHttpsRedirect
#              value: false
#            - path: tls.servers.tenant.enableHttpsRedirect
#              value: false
      istio-controlplane:
        istiod:
          values:
            # Reminder: this should be set to the number of proxies in front of Istio, which may be more than 1 in some setups
            - path: meshConfig.defaultConfig.gatewayTopology.numTrustedProxies
              value: 1
      keycloak:
        keycloak:
          values:
            - path: thirdPartyIntegration.tls.tlsCertificateHeader
              # This header is used by the ALB to pass the client certificate
              value: "x-amzn-mtls-clientcert"
            - path: thirdPartyIntegration.tls.tlsCertificateFormat
              # This format is used by Keycloak to parse the client certificate.
              # Supported formats are "AWS" and "PEM".
              value: "AWS"
```

#### Infrastructure Requirements

When using an L7 Load Balancer, UDS Core completely trusts information passed through the Istio Gateways. In order to provide the necessary security guarantees, the following infrastructure requirements must be met:

- All the network components between the public internet and the Istio Gateways must be hardened against HTTP header injection and spoofing attacks.
- The Client Certificate header always needs to be sanitized and ensure a client application cannot forge it (from both outside and inside the cluster).
- All the traffic between edge and Istio Gateways must be secured (and preferably not reachable from both inside and outside the cluster).

If any of these requirements cannot be met, it is not recommended to make any authentication decisions based on the Client Certificate header. We would recommend using other MFA methods instead.

