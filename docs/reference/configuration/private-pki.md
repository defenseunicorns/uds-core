---
title: Private Certificate Authority (CA) Configuration
---

Some UDS Core components need to connect to external services over TLS. By default, they trust the well-known public certificate authorities (CAs) that come with their container images. If your environment uses self-signed certificates or certificates issued by a private CA, these components will not trust those endpoints unless you explicitly provide the CA bundle.

This guide explains how to configure UDS Core components to recognize and trust your private CA certificates. Not every component requires this configuration — only those that make outbound TLS connections (for example, to identity providers, object storage, or other HTTPS endpoints).

:::tip Who should use this guide?
If your UDS Core environment connects to services using **self-signed certificates** or certificates issued by a **private CA**, you’ll need to follow this configuration.  
If you only use certificates from public, trusted CAs (e.g., Let’s Encrypt, DigiCert), you do **not** need these steps.
:::

## Prerequisites

Before configuring private PKI, you'll need the following:

1. The trusted CA bundle in PEM format that your certificates are signed by
2. A ConfigMap containing the trusted CA bundle from (1), available in each namespace (a tool like [trust-manager](https://cert-manager.io/docs/trust/trust-manager/) can help automate this)

:::note
For the examples in this guide, we assume you have a ConfigMap named `private-ca` with a key `ca.pem` that contains your CA bundle.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: private-ca
  namespace: <your-namespace>
data:
  ca.pem: |
    -----BEGIN CERTIFICATE-----
    MIIDeTCCAmGgAwIBAgIUQj...<snip>...hQ==
    -----END CERTIFICATE-----
```
:::

## Component Configuration

### Authservice

Authservice can be configured with an additional trusted CA bundle when UDS Core ingress gateways are deployed with private PKI.

To configure, set `UDS_CA_CERT` as an environment variable with a Base64 encoded PEM formatted CA bundle that can be used to verify the certificates of the tenant gateway.

See [trusted-ca.md](./single-sign-on/trusted-ca.md) for complete Authservice configuration details.

### Grafana

Grafana may need to access external https services.  If these services use certificates signed by a private CA, Grafana needs to be configured to trust these certificates.

Configure Grafana to trust private certificates by mounting and overriding the CA bundle via UDS Bundle overrides:

```yaml
values:
  - path: extraConfigMapMounts
    value:
      - name: ca-certs
        mountPath: /etc/ssl/certs/ca-certificates.crt # For Debian/Ubuntu images
        # For RedHat-based images (registry1 flavor), use:
        # mountPath: /etc/pki/tls/certs/ca-bundle.crt
        configMap: private-ca
        readOnly: true
        subPath: ca.pem
```

:::caution
Mounting to `/etc/ssl/certs/ca-certificates.crt` replaces the system CA bundle. Ensure your CA bundle includes both your private CA certificates and any public CAs that Grafana needs to trust.
:::

For additional details on Grafana private CA configuration, see the [upstream Grafana documentation](https://grafana.com/docs/grafana/latest/setup-grafana/installation/helm/#configure-a-private-ca-certificate-authority).

### Velero

Velero may need to access external backup storage services. If these services use certificates signed by a private CA, Velero needs to be configured to trust these certificates.

Configure Velero to trust private certificates by mounting the CA bundle via UDS Bundle overrides:

```yaml
values:
  - path: extraVolumeMounts
    value:
      - name: ca-certs
        mountPath: /etc/ssl/certs/ca-certificates.crt # For Debian/Ubuntu images
        # For RedHat-based images (registry1 flavor), use:
        # mountPath: /etc/pki/tls/certs/ca-bundle.crt
        subPath: ca.pem
        readOnly: true
  - path: extraVolumes
    value:
      - name: ca-certs
        configMap:
          name: private-ca
```

:::caution
Mounting to `/etc/ssl/certs/ca-certificates.crt` replaces the system CA bundle. Ensure your CA bundle includes both your private CA certificates and any public CAs that Velero needs to trust.
:::

### Loki

Loki components need to access external storage backends. To configure Loki to use S3-compatible storage with private certificates, you need to provide the CA bundle to all components.

Configure Loki to trust private certificates by overriding the system CA bundle using global volume mounts:

```yaml
values:
  - path: global.extraVolumeMounts
    value:
      - name: ca-certs
        mountPath: /etc/ssl/certs/ca-certificates.crt # For Debian/Ubuntu images
        # For RedHat-based images (registry1 flavor), use:
        # mountPath: /etc/pki/tls/certs/ca-bundle.crt
        subPath: ca.pem
  - path: global.extraVolumes
    value:
      - name: ca-certs
        configMap:
          name: private-ca
```

:::caution
This approach replaces the system CA bundle for all Loki components. Ensure your CA bundle includes both your private CA certificates and any public CAs that Loki needs to trust.
:::

### Keycloak

Keycloak needs to validate certificates when connecting to external identity providers or LDAP servers. Configure Keycloak to trust private certificates using its built-in truststore mechanism:

```yaml
values:
  - path: extraVolumeMounts
    value:
      - name: ca-certs
        mountPath: /opt/keycloak/conf/truststores/private-ca
        readOnly: true
  - path: extraVolumes
    value:
      - name: ca-certs
        configMap:
          name: private-ca
```

Keycloak automatically scans the `conf/truststores` directory for certificate files and adds them to its system truststore, preserving existing Java default certificates.

For additional details on Keycloak truststore configuration, see the [upstream Keycloak documentation](https://www.keycloak.org/server/keycloak-truststore#_configuring_the_system_truststore).
