---
title: Trusted Certificate Authority
---

Authservice can be configured with additional trusted certificate bundle in cases where UDS Core ingress gateways are deployed with private PKI.

To configure, set `UDS_CA_CERT` as an environment variable with a Base64 encoded PEM formatted CA bundle that can be used to verify the certificates of the tenant gateway.

Alternatively you can specify the `caCert` override in your `uds-bundle.yaml`:

```yaml
packages:
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      uds-operator-config:
        uds-operator-config:
          values:
            - path: cluster.expose.caCert
              value: <base64 encoded certificate authority>
```

See [configuring Istio Ingress](https://uds.defenseunicorns.com/reference/configuration/ingress/#configure-domain-name-and-tls-for-istio-gateways) for the relevant documentation on configuring ingress certificates.
