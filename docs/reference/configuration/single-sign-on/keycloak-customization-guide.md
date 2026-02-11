---
title: Keycloak Customization Guide
---

## Keycloak Customization Guide

UDS Core provides three distinct approaches for customizing Keycloak, each serving different needs:

1. **Helm Chart Values** - Configure operational settings and simple branding via bundle overrides
2. **UDS Identity Config Image** - Add custom code, themes, and plugins by building a custom image
3. **OpenTofu/IaC** - Manage Keycloak resources (auth flows, identity providers, groups, users) declaratively after deployment

This guide helps you choose the right approach for your customization needs.

:::note
 **For detailed implementation instructions**, see the [UDS Identity Config Customization Guide](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/).
:::

## Quick Reference

| What You Need | Approach | Documentation |
|---------------|-------------|---------------|
| Change logo, favicon, or background | Helm Chart Values | [Branding Customizations](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#branding-customizations) |
| Adjust resources or scaling | Helm Chart Values | [UDS Core Keycloak Values](https://github.com/defenseunicorns/uds-core/blob/main/src/keycloak/chart/values.yaml) |
| Enable/disable auth methods (install only) | Helm Chart Values | [Authentication Flows](https://uds.defenseunicorns.com/reference/uds-core/idam/authentication-flows/) |
| Configure realm settings    | Helm Chart Values | [Templated Realm Values](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#templated-realm-values) |
| Add custom plugin/JAR | Identity Config Image | [Add Additional JARs](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#add-additional-jars) |
| Customize theme beyond branding | Identity Config Image | [Customizing Theme](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-theme) |
| Modify realm configuration | Identity Config Image | [Customizing Realm](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-realm) |
| Manage auth flows/identity providers/groups as code | OpenTofu/IaC | [OpenTofu Configuration](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#opentofu-keycloak-client-configuration) |

## Customization Approaches

### Approach 1: Helm Chart Values

**Use for**: Configuration changes that don't require custom code, anything in the [chart values](https://github.com/defenseunicorns/uds-core/blob/main/src/keycloak/chart/values.yaml)

**Examples**:
- Scaling replicas or adjusting resources
- Configuring session timeouts
- Enabling/disabling authentication methods at install time
- Simple branding (logo, favicon, background)
- Configuring HTTP retry behavior for outgoing requests

**Key Point**: Changes are applied via UDS bundle overrides and don't require rebuilding images.

```yaml
packages:
  - name: core
    overrides:
      keycloak:
        keycloak:
          values:
            - path: resources.requests.memory
              value: "1Gi"
```

### Approach 2: UDS Identity Config Image

**Use for**: Custom code, themes, plugins, or realm modifications

**Examples**:
- Adding custom authentication providers
- Creating custom themes with HTML/CSS changes
- Installing third-party Keycloak plugins
- Modifying the default realm structure

**Key Point**: Requires building a custom identity-config image from the [uds-identity-config repository](https://github.com/defenseunicorns/uds-identity-config).

**Build and Deploy**: See [Testing and Deployment Customizations](https://uds.defenseunicorns.com/reference/uds-core/idam/testing-deployment-customizations/) for detailed instructions on building custom images, using Zarf packages, and deploying to UDS Core.

```yaml
packages:
  - name: core
    overrides:
      keycloak:
        keycloak:
          values:
            - path: configImage
              value: ghcr.io/your-org/identity-config:1.0.0
```

### Approach 3: OpenTofu / Infrastructure as Code

**Use for**: Managing Keycloak resources declaratively after deployment

**Examples**:
- Managing complex auth flows
- Managing groups and role mappings
- Configuring identity providers
- Automating user provisioning

**Key Point**: Manages running Keycloak resources declaratively in code without redeployment.

### Deployment Flow:
1. **Helm values** configure Keycloak at deployment time
2. **Identity config image** syncs custom files via init container
3. **OpenTofu** manages resources in the running instance

**Key Points**:
- Helm values: Applied at deployment, no image rebuild needed
- Identity config: Requires image rebuild, applied at pod startup
- OpenTofu: Applied to running instance, no redeployment needed

## Choosing the Right Approach

### Choose Helm Chart Values When:
- You need to adjust operational settings (resources, replicas, timeouts)
- You want to enable/disable built-in authentication methods at install time
- You need simple branding changes (logo, favicon, background)
- Changes are environment-specific
- You don't want to rebuild images

### Choose Identity Config Image When:
- You need to add custom Java plugins or libraries
- You want extensive theme customization (HTML/CSS/JS changes)
- You need to modify the default realm structure
- You're adding custom PKI certificates
- You're implementing custom Keycloak SPIs

### Choose OpenTofu/IaC When:
- You need to configure external identity providers (SAML, OIDC, LDAP)
- You want to manage advanced authentication flows post-deployment
- You want to manage Keycloak resources as code
- You need to manage groups, users, and roles declaratively
- You're handling upgrade scenarios with complex configurations

:::note
  OpenTofu is better suited for:
  - Complex identity provider configurations
  - Managing resources during upgrades
  - Advanced configurations not supported by Package CRs
:::

## HTTP Retry Configuration

Keycloak can automatically retry failed outgoing HTTP requests to handle transient network errors or temporary service unavailability. This is useful for improving resilience when Keycloak communicates with external services (identity providers, databases, etc.).

### Configuration

HTTP retry behavior is disabled by default and must be explicitly enabled by setting `maxRetries` above `0`. Configure it via Helm chart values:

```yaml
packages:
  - name: core
    overrides:
      keycloak:
        keycloak:
          values:
            - path: httpRetry.maxRetries
              value: 2
            - path: httpRetry.initialBackoffMillis
              value: 1000
            - path: httpRetry.backoffMultiplier
              value: 2.0
            - path: httpRetry.applyJitter
              value: true
            - path: httpRetry.jitterFactor
              value: 0.5
```

### Configuration Options

| Option                 | Description                           | Default |
|------------------------|---------------------------------------|---------|
| `maxRetries`           | Maximum retry attempts (0 = disabled) | `0`     |
| `initialBackoffMillis` | Initial backoff time in milliseconds  | `1000`  |
| `backoffMultiplier`    | Exponential backoff multiplier        | `2.0`   |
| `applyJitter`          | Apply jitter to prevent retry storms  | `true`  |
| `jitterFactor`         | Jitter factor for backoff variation   | `0.5`   |

### When to Enable HTTP Retries

**Enable retries when**:
- Keycloak communicates with external identity providers over unreliable networks
- Database connections experience transient failures
- External services (email, LDAP, etc.) have occasional availability issues
- OCSP responders need multiple attempts to validate certificates
- You need improved resilience for production deployments

**Keep disabled when**:
- Network is stable and reliable
- You want faster failure detection
- External services have circuit breakers implemented
- Development/testing environments where fast feedback is preferred

## Additional Resources

- **[UDS Identity Config Customization Guide](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#_top)** - Detailed implementation instructions
- **[UDS Core SSO Overview](https://uds.defenseunicorns.com/reference/configuration/single-sign-on/overview/)**
- **[UDS Core Identity Config Overview](https://uds.defenseunicorns.com/reference/uds-core/idam/uds-identity-config-overview/)**
- **[Keycloak Documentation](https://www.keycloak.org/documentation)** - Official Keycloak docs
- **[UDS Identity Config Repository](https://github.com/defenseunicorns/uds-identity-config)** - Source code and examples
