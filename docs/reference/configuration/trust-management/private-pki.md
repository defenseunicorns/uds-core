---
title: Private Certificate Authority (CA) Configuration
sidebar:
  order: 8.2
---

Some UDS Core components need to connect to external services over TLS. By default, they trust the well-known public certificate authorities (CAs) that come with their container images. If your environment uses self-signed certificates or certificates issued by a private CA, these components will not trust those endpoints unless you explicitly provide the CA bundle.

Example scenarios include:
- **Your domain cert is self-signed or private PKI**: Grafana would need the CA for SSO to work with Keycloak
- **External dependencies use private PKI**: Velero, Loki (object storage) and potentially Grafana/Keycloak for databases, data sources, external identity providers

This guide explains how to configure UDS Core components to recognize and trust your private CA certificates. Not every component requires this configuration — only those that make outbound TLS connections (for example, to identity providers, object storage, or other HTTPS endpoints).

:::tip[Who should use this guide?]
If your UDS Core environment connects to services using **self-signed certificates** or certificates issued by a **private CA**, you'll need to follow this configuration.
If you only use certificates from public, trusted CAs (e.g., Let's Encrypt, DigiCert), you do **not** need these steps.
:::

:::caution[Security Consideration]
Mounting additional volumes and certificates can introduce minimal security risks by expanding the attack surface. Only mount trusted CA certificates from verified sources and regularly audit your certificate configurations.
:::

## Prerequisites

Before configuring private PKI, you'll need the following:

1. The trusted CA bundle in PEM format that your certificates are signed by
2. A ConfigMap containing the trusted CA bundle from (1), available in each namespace (see [Central Trust Bundle Management](/reference/configuration/trust-management/central-trust-bundle-management) for details on doing this with UDS Core.)

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

## CA Mounting Approaches

There are two main approaches for configuring applications to trust private CA certificates:

### System CA Bundle Replacement
This approach replaces the entire system CA bundle with your custom bundle at the container level. This gives you complete control but requires your bundle to include both your private CAs and any public CAs the application needs.

**When to use:**
- You want complete control over which CAs are trusted
- Your environment should only trust specific private CAs
- You need to restrict trust to a limited set of CAs

**Paths:**
- Debian/Ubuntu: `/etc/ssl/certs/ca-certificates.crt`
- RedHat/CentOS: `/etc/pki/tls/certs/ca-bundle.crt`

### Additional CA Trust (Go Applications)
Many Go-based applications automatically check `/etc/ssl/certs/ca.pem` for additional CA certificates alongside the system bundle. This approach adds your private CAs without replacing the system CAs.

**When to use:**
- You want to trust private CAs alongside standard public CAs
- The application is Go-based and supports this path
- You prefer a less intrusive approach

**Path:**
- `/etc/ssl/certs/ca.pem` (Go applications)

## Component Configuration

### Authservice

Authservice automatically trusts the combined UDS CA bundle (Private PKI + DoD + Public CAs) when configured via the UDS Operator. This ensures it can verify the certificates of the tenant gateway without manual certificate injection.

To configure, define the `caBundle` variables in your `uds-config.yaml` (or via environment variables with the `UDS_` prefix like `UDS_CA_BUNDLE_CERTS` at deploy time). For example:

```yaml
variables:
  core:
    CA_BUNDLE_CERTS: "LS0tLS1CRUdJTi..." # Base64 encoded PEM bundle
    CA_BUNDLE_INCLUDE_DOD_CERTS: "true"
```

See [trusted CA SSO doc](/reference/configuration/single-sign-on/trusted-ca) for complete Authservice configuration details.

### Grafana

Grafana may need to access external https services.  If these services use certificates signed by a private CA, Grafana needs to be configured to trust these certificates.

By default, UDS Core will automatically mount private certificates (and DoD Certs if `UDS_CA_BUNDLE_INCLUDE_DOD_CERTS` is `true`) provided by `UDS_CA_BUNDLE_CERTS` so that Grafana will trust them. This uses the default UDS trust bundle created by the UDS Operator and is mounted at `/etc/ssl/certs/ca.pem`.

:::caution
If you override the Grafana helm values for `extraConfigmapMounts`, these will override the default values and the automatic trust bundle mounting will **not** occur. In this case, you must either merge your custom mounts with the new defaults or rely solely on the automatic mounting. Be sure to review your configuration to ensure Grafana trusts the intended certificate authorities.
:::

If you wish to not use the automatic mounting, you can manually configure Grafana to trust private certificates by mounting the CA bundle via UDS Bundle overrides:

```yaml
values:
  - path: extraConfigmapMounts
    value:
      - name: ca-certs
        mountPath: /etc/ssl/certs/ca.pem # Adds CA alongside system CAs (Go applications)
        # Alternative - System CA replacement (requires bundle with both private and public CAs):
        # mountPath: /etc/ssl/certs/ca-certificates.crt # For Debian/Ubuntu images (upstream, unicorn flavors)
        # mountPath: /etc/pki/tls/certs/ca-bundle.crt # For RedHat-based images (registry1 flavor)
        configMap: private-ca
        readOnly: true
        subPath: ca.pem
```

For additional details on Grafana private CA configuration, see the [upstream Grafana documentation](https://grafana.com/docs/grafana/latest/setup-grafana/installation/helm/#configure-a-private-ca-certificate-authority).

### Velero

Velero may need to access external backup storage services. If these services use certificates signed by a private CA, Velero needs to be configured to trust these certificates.

Configure Velero to trust private certificates by mounting the CA bundle via UDS Bundle overrides:

```yaml
values:
  - path: extraVolumeMounts
    value:
      - name: ca-certs
        mountPath: /etc/ssl/certs/ca.pem # Recommended: Adds CA alongside system CAs (Go applications)
        # Alternative - System CA replacement (requires bundle with both private and public CAs):
        # mountPath: /etc/ssl/certs/ca-certificates.crt # For Debian/Ubuntu images (upstream, unicorn flavors)
        # mountPath: /etc/pki/tls/certs/ca-bundle.crt # For RedHat-based images (registry1 flavor)
        subPath: ca.pem
        readOnly: true
  - path: extraVolumes
    value:
      - name: ca-certs
        configMap:
          name: private-ca
```

:::caution
Mounting to system CA paths (`/etc/ssl/certs/ca-certificates.crt` or `/etc/pki/tls/certs/ca-bundle.crt`) replaces the system CA bundle. Ensure your CA bundle includes both your private CA certificates and any public CAs that Velero needs to trust.
:::

### Loki

Loki components need to access external storage backends. To configure Loki to use S3-compatible storage with private certificates, you need to provide the CA bundle to all components.

Configure Loki to trust private certificates using global volume mounts:

```yaml
values:
  - path: global.extraVolumeMounts
    value:
      - name: ca-certs
        mountPath: /etc/ssl/certs/ca.pem # Adds CA alongside system CAs (Go applications)
        # Alternative - System CA replacement (requires bundle with both private and public CAs):
        # mountPath: /etc/ssl/certs/ca-certificates.crt # For Debian/Ubuntu images (upstream, unicorn flavors)
        # mountPath: /etc/pki/tls/certs/ca-bundle.crt # For RedHat-based images (registry1 flavor)
        subPath: ca.pem
  - path: global.extraVolumes
    value:
      - name: ca-certs
        configMap:
          name: private-ca
```

:::caution
Mounting to system CA paths replaces the system CA bundle for all Loki components. Ensure your CA bundle includes both your private CA certificates and any public CAs that Loki needs to trust.
:::

### Keycloak

Keycloak needs to validate certificates when connecting to external identity providers or LDAP servers.

By default, UDS Core will automatically mount private certificates (and DoD Certs if `UDS_CA_BUNDLE_INCLUDE_DOD_CERTS` is `true`) provided by `UDS_CA_BUNDLE_CERTS` so that Keycloak will trust them. This uses the default UDS trust bundle created by the UDS Operator and is mounted at `/tmp/ca-certs` with the truststore path configured automatically.

:::caution
If you override the Keycloak helm values for `extraVolumes`, `extraVolumeMounts`, or `truststorePaths`, these will override the default values and the automatic trust bundle mounting will **not** occur. In this case, you must either merge your custom mounts with the new defaults or rely solely on the automatic mounting. Be sure to review your configuration to ensure Keycloak trusts the intended certificate authorities.
:::

If you wish to not use the automatic mounting, you can manually configure Keycloak to trust private certificates by mounting the CA bundle via UDS Bundle overrides:

```yaml
values:
  - path: extraVolumeMounts
    value:
      - name: ca-certs
        mountPath: /tmp/ca-certs
        readOnly: true
  - path: extraVolumes
    value:
      - name: ca-certs
        configMap:
          name: private-ca
  - path: truststorePaths
    value:
      - "/tmp/ca-certs"
```

For additional details on Keycloak truststore configuration, see the [upstream Keycloak documentation](https://www.keycloak.org/server/keycloak-truststore#_configuring_the_system_truststore).
