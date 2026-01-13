---
title: Trusted Certificate Authority
---

Authservice and Istio automatically consume the combined trust bundle (Private PKI + DoD + Public CAs) when those features are enabled in the UDS Cluster Configuration. This ensures seamless TLS verification for SSO and internal service communication without requiring manual duplication of certificates.

To configure, set `CA_BUNDLE_CERTS` in your `uds-config.yaml`. If you also enable `CA_BUNDLE_INCLUDE_DOD_CERTS` or `CA_BUNDLE_INCLUDE_PUBLIC_CERTS`, these will be automatically merged into the trust chain used by Authservice and Istio.

Alternatively you can specify the `CA_BUNDLE_CERTS` variable in your `uds-config.yaml`:

```yaml
variables:
  core:
    CA_BUNDLE_CERTS: <base64 encoded certificate authority>
```

:::note[Legacy Support]
The `CA_CERT` variable is still supported for backwards compatibility but is deprecated. Use `CA_BUNDLE_CERTS` for new deployments.
:::

See [configuring Istio Ingress](https://uds.defenseunicorns.com/reference/configuration/ingress/#configure-domain-name-and-tls-for-istio-gateways) for the relevant documentation on configuring ingress certificates.
