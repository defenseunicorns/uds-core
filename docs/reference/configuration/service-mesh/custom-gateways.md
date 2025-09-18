---
title: Custom Gateways
sidebar:
  order: 5
---

UDS Core lets you expose services on **custom Istio gateways** beyond the standard tenant, admin, and passthrough gateways. While the standard gateways fit most use cases, you might need a custom gateway for specialized security, different access control, unique TLS settings, or custom domain routing.

This document explains how to configure and use custom gateways in your UDS Core deployment when standard gateways don't meet your requirements.

:::note
While UDS Core allows you to expose services on custom gateways, you are responsible for creating, configuring, and managing these gateways. UDS Core only handles the integration with the Package CR system.
:::

## Creating a Custom Gateway

UDS Core's gateways follow a pattern of provisioning a single [Ingress Gateway](https://github.com/istio/istio/tree/master/manifests/charts/gateway) per [Istio Gateway custom resource](https://istio.io/latest/docs/reference/config/networking/gateway/). The ingress gateway provides the actual deployment and load balancer service used to route requests, while the gateway custom resource provides configuration detailing the hosts and TLS settings for requests to respond to. By ensuring these are always 1:1 you can maintain clear separation between gateways with different domains, TLS modes, and security controls.

To provision an ingress gateway you will want to use the upstream Istio helm chart in your zarf package. Then you can add additional manifests (or a copy of the UDS Core gateway config chart) to create the gateway CR and any necessary TLS credential secrets.

When constructing your Zarf package and values you will want to pick a short name for your gateway. In the example below this is "custom". There are a few very important configuration items that you must ensure match the expected patterns for naming:
- `releaseName` for the `gateway` chart MUST match `<gateway-name>-ingressgateway` (`custom-ingressgateway` above)
- `namespace` for BOTH charts MUST match `istio-<gateway-name>-gateway` (`istio-custom-gateway` above)
- `name` in your `uds-istio-config` chart values MUST match `<gateway-name>` (`custom` above)

These naming conventions will ensure that you are able to properly expose a service via the gateway. Also be aware of two keywords that you can use in your gateway name to alter the behavior:
- `admin`: If present in your gateway's name, such as `custom-admin`, the `domain` will default to the admin domain for all `expose` entries. You will still need to ensure that your gateway values properly set this domain as well.
- `passthrough`: If present in your gateway's name, such as `custom-passthrough`, there will be an extra SNI Host match added for all `expose` entries (reference [Istio documentation](https://istio.io/latest/docs/reference/config/networking/virtual-service/#TLSRoute)).

The below example shows how to create a zarf package for a "custom" gateway:

```yaml
kind: ZarfPackageConfig
metadata:
  name: custom-gateway
  description: "Custom gateway for UDS Core"
components:
  - name: istio-custom-gateway
    required: true
    charts:
      # This is the Ingress Gateway from upstream Istio
      - name: gateway
        url: https://istio-release.storage.googleapis.com/charts
        version: 1.26.2 # This should match the Istio version currently in UDS Core
        releaseName: custom-ingressgateway # This should be <gateway-name>-ingressgateway
        namespace: istio-custom-gateway # This should be istio-<gateway-name>-gateway
      - name: uds-istio-config
        version: v0.52.0 # This should match the version of UDS Core you are deploying
        url: https://github.com/defenseunicorns/uds-core.git
        gitPath: src/istio/charts/uds-istio-config
        namespace: istio-custom-gateway # This should be istio-<gateway-name>-gateway
        valuesFiles:
          - "config-custom.yaml"
```

Then for your values file (`config-custom.yaml` above) you will want to need to setup your configuration. Reference the [default values file](https://github.com/defenseunicorns/uds-core/blob/main/src/istio/charts/uds-istio-config/values.yaml) for full configuration options, but you will need to at minimum provide:

```yaml
name: custom # This should be <gateway-name>

domain: mydomain.dev # Set domain if different from default tenant domain for this gateway

tls:
  servers:
    custom:
      mode: # One of `SIMPLE`, `MUTUAL`, 'OPTIONAL_MUTUAL', `PASSTHROUGH`
```

Other fields may or may not apply depending on your configuration desires (specific subdomain hosts, TLS certificates, etc). If using a gateway that is not in PASSTHROUGH mode you will need to supply a TLS cert and key. Typically this should be done during deployment by exposing these values as variables in your bundle, like the below example:

```yaml
packages:
  - name: custom-gateway
    ...
    overrides:
      istio-custom-gateway:
        uds-istio-config:
          # Set via UDS_ environment variables, `--set` at deploy time, or `uds-config.yaml`
          variables:
            - name: CUSTOM_TLS_CERT
              description: "The TLS cert for the custom gateway (must be base64 encoded)"
              path: tls.cert
            - name: CUSTOM_TLS_KEY
              description: "The TLS key for the custom gateway (must be base64 encoded)"
              path: tls.key
          # Alternatively, point to an existing secret
          values:
            - path: tls.credentialName
              value: custom-gateway-tls-secret # Reference to the Kubernetes secret for the custom gateway's TLS certificate
```

## Exposing a Service

The UDS Operator supports exposing services through your custom gateway as part of the normal `network.expose` config in the `Package` custom resource. This is generally no different than exposing any other service with the `Package`, you will just need to provide your custom gateway name and optionally the domain to expose your service on:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: foobar
  namespace: foobar
spec:
  network:
    expose:
      - service: foobar
        selector:
          app.kubernetes.io/name: foobar
        gateway: custom
        domain: mydomain.dev
        host: foobar
        port: 8080
```

Make sure that the `gateway` name lines up with the name you used in your gateway deployment (`custom` in our example). For `domain`, you will want to set this if exposing your service on a domain different from the default domain name for your environment.

- `gateway`: This is where you will want to use the name of your gateway (matching the name used in your Zarf package for the gateway - `custom` from our example).
- `domain`: If exposing your service on a domain that is different from the default domain name for your environment (or admin domain name if your gateway includes admin), ensure that you have set this to the expected domain value.

The UDS Operator will handle creating the necessary resources to ensure that your service is properly exposed through your custom gateway.
