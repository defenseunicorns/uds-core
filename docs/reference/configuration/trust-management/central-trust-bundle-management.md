---
title: Central Trust Bundle Management
sidebar:
  order: 8.1
---

UDS Core provides a centralized trust bundle management system that automatically builds and distributes certificate trust bundles across the cluster. This system allows you to define a unified trust source that all packages can automatically consume, regardless of whether the trust bundle includes private, public, or DoD-specific Certificate Authority (CA) certificates.

## Overview

The central trust bundle management feature addresses the challenge of maintaining consistent certificate trust chains across environments. Rather than each package independently managing trusted CA configuration, UDS Core provides a standardized mechanism to:

- **Centrally manage CA certificates**: Define trust bundles in one place through Cluster Configuration
- **Automatically distribute trust stores**: Generate and distribute trust bundles to all namespaces
- **Support multiple CA sources**: Include private/custom, DoD, and public CA certificates as needed

When you configure a trust bundle, UDS Core automatically:
- Creates ConfigMaps in each namespace: Containing the combined CA certificates in PEM format that applications can mount and use.
- Updates Istio Trust: Syncs the combined bundle to the `sso-ca-cert` secret in the `istio-system` namespace for JWKS fetching.
- Configures Authservice Trust: Injects the combined bundle directly into the Authservice configuration for OIDC TLS verification.

## Configuration

Trust bundles are configured during UDS Core deployment using UDS/Zarf variables:

### UDS Core Deployment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CA_BUNDLE_CERTS` | Base64 encoded CA certs (bundle) in PEM format that UDS Core will inherently trust. At minimum, this must include your Domain CA Cert if using Private PKI for your UDS Core deployment | `""` (empty) |
| `CA_BUNDLE_INCLUDE_DOD_CERTS` | Include DoD CA certificates in the bundle | `false` |
| `CA_BUNDLE_INCLUDE_PUBLIC_CERTS` | Include standard public CA certificates in the bundle | `false` |

:::note[Legacy Support]
The `CA_CERT` variable is still supported for backwards compatibility but is deprecated. Use `CA_BUNDLE_CERTS` for new deployments. This new variable is also used for Authservice configuration as described in the [trusted CA SSO documentation](/reference/configuration/single-sign-on/trusted-ca).
:::

### Cluster Trust Bundle Configuration

The UDS Core trust bundle is configured at deployment time at the cluster level.

Configure these variables in your `uds-config.yaml` file to set up the trust bundle. For example:
```yaml
variables:
  core:
    CA_BUNDLE_CERTS: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t..."  # Base64 encoded PEM bundle
    CA_BUNDLE_INCLUDE_DOD_CERTS: "true" # default false
    CA_BUNDLE_INCLUDE_PUBLIC_CERTS: "true" # default false
```

The above example will build a trust bundle that includes your custom CA certificates, DoD CAs, and public CAs concatted together in PEM format. Both the DoD and Public CAs are packaged with UDS Core. This combined bundle is automatically used by platform components like Istio and Authservice.

### UDS Package Configuration

Trust bundle ConfigMaps are automatically deployed in all namespaces that contain a UDS Package CR. You can customize the ConfigMap configuration using the `caBundle` field in your Package CR:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  namespace: my-package
spec:
  caBundle:
    configMap:
      name: uds-trust-bundle # default: uds-trust-bundle - name of the ConfigMap created in the package namespace
      key: ca-bundle.pem     # default: ca-bundle.pem - key name inside the ConfigMap
      labels:                # default: {} - list of labels to apply to the ConfigMap created
        uds.dev/pod-reload: "true" # apply this label to enable pod reloads on change of this configmap
      annotations:           # default: {} - list of annotations to apply to the ConfigMap
        uds.dev/pod-reload-selector: "app=my-app" # annotation to specify which pods to reload on configmap change
```

The above package CR will create a ConfigMap named `uds-trust-bundle` in the `my-package` namespace with the trust bundle under the key `ca-bundle.pem`. The specified labels and annotations will also be applied to the ConfigMap.

### Mounting the Trust Bundle

Applications can mount the trust bundle ConfigMap into their pods to use the CA certificates for TLS verification. The mount path for the system trust store will depend on the container distribution/application requirements. Common paths include for system trust store replacement:

- Debian/Ubuntu: `/etc/ssl/certs/ca-certificates.crt`
- RedHat/CentOS: `/etc/pki/tls/certs/ca-bundle.crt`

:::caution[Application Trust Store Usage]
Replacing the system trust store does not always guarantee that your application will use the system trust store. Different programming languages and crypto libraries may have their own trust store locations or use embedded CA certificates. You should consult your application's documentation and crypto package/library to understand where it pulls trusted certificates from.
:::

## DoD Certs

UDS Core includes an option to add DoD CA certificates to the trust bundle. When `CA_BUNDLE_INCLUDE_DOD_CERTS` is set to `true`, the standard DoD CA certificates packaged with UDS Core will be included in the trust bundle.

UDS Core pulls these certs from: [DoD Approved External PKI Trust Chains](https://dl.dod.cyber.mil/wp-content/uploads/pki-pke/zip/unclass-dod_approved_external_pkis_trust_chains.zip)

You can also see the certs checked into the UDS Core repository source code here: [UDS Core DoD Certificates](https://github.com/defenseunicorns/uds-core/tree/main/certs/dod)

## Public Certs

The UDS Core trust bundle includes a subset of public CA certificates from the Mozilla CA store.  UDS Core only includes widely trusted Public CAs that are based out of the United States or are commonly used for global services.

You can find the full list of public CAs included here [UDS Core Public Trust Config](https://github.com/defenseunicorns/uds-core/blob/main/certs/public/uds-core-public-ca-trust-config.yaml).

The resulting PEM bundle is here [UDS Core Public CA Bundle](https://github.com/defenseunicorns/uds-core/blob/main/certs/public/ca-bundle.pem).
