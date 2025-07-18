---
title: L7 Load Balancer
---

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
            - path: meshConfig.defaultConfig.gatewayTopology.numTrustedProxies
              value: 1
      keycloak:
        keycloak:
          values:
            - path: thirdPartyIntegration.tls.tlsTermination
              value: "external"
            - path: thirdPartyIntegration.tls.tlsCertificateHeader
              # This header is used by the ALB to pass the client certificate
              value: "x-amzn-mtls-clientcert"
            - path: thirdPartyIntegration.tls.tlsCertificateFormat
              # This format is used by Keycloak to parse the client certificate.
              # Supported formats are "AWS" and "PEM".
              value: "AWS"
```
