---
title: Trusted Certificate Authority
---

Authservice can be configured with additional trusted certificate bundle in cases where UDS Core ingress gateways are deployed with private PKI.

To configure, set [UDS_CA_CERT](https://github.com/defenseunicorns/uds-core/blob/main/src/pepr/uds-operator-config/values.yaml#L8) as an environment variable with a Base64 encoded PEM formatted certificate bundle that can be used to verify the certificates of the tenant gateway.

Alternatively you can specify the `CA_CERT` variable in your `uds-config.yaml`:

```yaml
variables:
  core:
    CA_CERT: <base64 encoded certificate authority>
```

See [configuring Istio Ingress](https://uds.defenseunicorns.com/reference/configuration/ingress/#configure-domain-name-and-tls-for-istio-gateways) for the relevant documentation on configuring ingress certificates.
