---
title: Keycloak Customization Guide
---

## Keycloak Customization Guide

UDS Core provides three distinct approaches for customizing Keycloak, each serving different needs:

1. **Helm Chart Values** - Configure operational settings and simple branding via bundle overrides
2. **UDS Identity Config Image** - Add custom code, themes, and plugins by building a custom image
3. **OpenTofu/IaC** - Manage Keycloak resources (clients, groups, users) declaratively after deployment

This guide helps you choose the right approach for your customization needs.

:::note
 **For detailed implementation instructions**, see the [UDS Identity Config Customization Guide](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/).
:::

## Quick Reference

| What You Need | Approach | Documentation |
|---------------|-------------|---------------|
| Change logo, favicon, or background | Helm Chart Values | [Branding Customizations](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#branding-customizations) |
| Adjust resources or scaling | Helm Chart Values | [UDS Core Keycloak Values](https://github.com/defenseunicorns/uds-core/blob/main/src/keycloak/chart/values.yaml) |
| Enable/disable auth methods | Helm Chart Values | [Templated Realm Values](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#templated-realm-values) |
| Add custom plugin/JAR | Identity Config Image | [Add Additional JARs](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#add-additional-jars) |
| Customize theme beyond branding | Identity Config Image | [Customizing Theme](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-theme) |
| Modify realm configuration | Identity Config Image | [Customizing Realm](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-realm) |
| Manage clients/groups as code | OpenTofu/IaC | [OpenTofu Configuration](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#opentofu-keycloak-client-configuration) |

## Customization Approaches

### Approach 1: Helm Chart Values

**Use for**: Configuration changes that don't require custom code

**Examples**:
- Scaling replicas or adjusting resources
- Configuring session timeouts
- Enabling/disabling authentication methods
- Simple branding (logo, favicon, background)

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
- Creating clients for applications
- Managing groups and role mappings
- Configuring identity providers
- Automating user provisioning

**Key Point**: Manages running Keycloak resources without redeployment.

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
- You want to enable/disable built-in authentication methods
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
- You want to manage Keycloak resources as code
- You need to automate client creation for applications
- You want GitOps workflows for identity management
- You need to manage groups, users, and roles declaratively
- Changes should be applied without redeployment

## Common Use Cases

### Simple Branding Update
**Approach**: Helm Chart Values
**Documentation**: [Branding Customizations](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#branding-customizations)

Use ConfigMaps to override logo, favicon, and background images without rebuilding anything.

### Adding a Custom Plugin
**Approach**: Identity Config Image
**Documentation**: [Add Additional JARs](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#add-additional-jars)

1. Add JAR to `src/extra-jars/` in uds-identity-config
2. Build custom image: `uds run build-and-publish`
3. Override `configImage` in UDS Core bundle

### Creating Application Clients
**Approach**: OpenTofu/IaC
**Documentation**: [OpenTofu Configuration](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#opentofu-keycloak-client-configuration)

Use the Keycloak Terraform provider to manage clients declaratively.

### Custom Theme Development
**Approach**: Identity Config Image
**Documentation**: [Customizing Theme](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-theme)

1. Modify files in `src/theme/` in uds-identity-config
2. Test locally: `uds run dev-theme`
3. Build and publish custom image

## Additional Resources

- **[UDS Identity Config Customization Guide](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#_top)** - Detailed implementation instructions
- **[UDS Core Keycloak README](https://github.com/defenseunicorns/uds-core/blob/main/src/keycloak/README.md)** - Package-specific information
- **[Keycloak Documentation](https://www.keycloak.org/documentation)** - Official Keycloak docs
- **[UDS Identity Config Repository](https://github.com/defenseunicorns/uds-identity-config)** - Source code and examples
