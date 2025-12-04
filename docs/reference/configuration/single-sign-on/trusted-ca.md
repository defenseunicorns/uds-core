---
title: Trusted Certificate Authority
---

Authservice can be configured with additional trusted certificate bundle in cases where UDS Core ingress gateways are deployed with private PKI.

To configure, set `UDS_CA_BUNDLE_CERTS` as an environment variable with a Base64 encoded PEM formatted CA bundle that can be used to verify the certificates of the tenant gateway. For details on configuring this variable, see the [Central Trust Bundle Management](/reference/configuration/trust-management/central-trust-bundle-management) documentation.

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
