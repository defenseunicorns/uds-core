---
title: Upgrading UDS Core
tableOfContents:
  maxHeadingLevel: 3
---

This guide provides instructions and best practices for upgrading UDS Core installations. Following these guidelines will help ensure a smooth upgrade process and minimize potential disruptions to your environment.

## Importance of Upgrades

Regularly upgrading UDS Core is essential for several reasons:

- **Security Patches**: Critical CVE fixes for both UDS Core components and underlying open source tooling
- **Bug Fixes**: Resolving issues in UDS Core and integrated open source components
- **New Features**: Access to new capabilities and improvements
- **Compatibility**: Ensuring continued compatibility with the broader UDS ecosystem

Staying current with UDS Core releases helps maintain the security posture and functionality of your environment.

## Upgrade Strategies

### Sequential Minor Version Upgrades

UDS Core is designed and tested for sequential minor version upgrades (e.g., 0.9.0 → 0.10.0 → 0.11.0). This approach:

- Follows the tested upgrade path
- Allows for incremental validation of each upgrade step
- Reduces complexity during troubleshooting

### Direct Version Jumps

Jumping multiple minor versions (e.g., 0.9.0 → 0.12.0) is **not directly tested** and requires additional caution:

- May encounter unforeseen compatibility issues
- Complicates troubleshooting as multiple changes are applied at once
- Requires more extensive testing in a staging environment

:::caution
If you must jump multiple versions, thoroughly review all release notes for intermediate versions and perform comprehensive testing in a staging environment before upgrading production.
:::

## Pre-Upgrade Checklist

Before upgrading UDS Core, complete the following preparation steps:

### Review Release Notes

Read the [release notes](https://github.com/defenseunicorns/uds-core/releases) for all versions between your current version and the target version. Pay special attention to:
- Breaking changes
- Keycloak / Identity Config specific upgrade steps (documented [here](/reference/uds-core/idam/upgrading-versions))
- Deprecated features
- Configuration changes
- New security policies and restrictions

### Test in Staging Environment

Testing in a staging environment that mirrors production is **strongly recommended**:

- Create or update a staging environment that closely resembles your production setup
- Perform the upgrade in staging first
- Validate all functionality before proceeding to production
- Document any issues encountered and their resolutions

:::important
The value of a staging environment cannot be overstated. It provides a safe space to identify and resolve issues before they impact production workloads.
:::

### Verify High Availability

If you require minimal downtime during upgrades:

- Ensure your applications are deployed with proper HA configurations
- Understand which UDS Core components may experience brief unavailability during upgrades
- Plan maintenance windows accordingly for components that cannot be upgraded without interruption

## Upgrade Process

### Update the UDS Core Bundle

Typically the actual version update is as easy as updating your version reference in a `uds-bundle.yaml`. For example if you had a bundle like the below:

```yaml
packages:
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.53.1-upstream
```

Upgrading to 0.54.1 would be as easy as updating this to:

```yaml
packages:
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.54.1-upstream
```

Try to avoid other concurrent package upgrades (e.g., zarf init or other UDS packages) or larger changes, such as switching between flavors, unless you have restrictive maintenance windows. Where possible, it is often better to perform these upgrades independently to simplify troubleshooting if issues occur.

### Update Configurations

Before creating the new bundle, update configuration as needed:

1. **UDS Core Configuration Changes**:
   - Review any changes required for UDS Core custom resources
   - Review any values changes to UDS Core helm charts and zarf variables

2. **Upstream Tool Configuration Changes**:
   - Review the release notes for upstream tools, especially if major version updates are included
   - Where necessary update bundle overrides based on any helm chart values changes

### Build and Deploy Bundle

Once you have updated the version reference for UDS Core and made any necessary configuration changes, create the updated bundle and deploy it. The example below is the bare minimum to create and deploy:

```console
# Create the bundle
uds create <path/to/uds-bundle.yaml> --confirm

# Deploy the bundle
uds deploy <path/to/bundle.tar.zst> --confirm
```

Depending on your configuration and process this may have additional steps with variables, dynamic environment configuration, etc.

## Post-Upgrade Verification

After the bundle deployment completes, verify the health and functionality of your environment:

1. **Verify UDS Core Components**:
  - The UDS Core deployment performs basic health checks automatically
  - Additionally confirm all UDS Core components are accessible at their endpoints, with SSO login

2. **Verify Mission Applications**:
  - Check that your mission apps are still running and healthy
  - Validate endpoint accessibility and proper configuration (i.e. monitoring, SSO working as expected)

## Upgrade Troubleshooting and Rollbacks

UDS Core does not officially test or support rollback procedures. Individual opensource applications included in the UDS Core platform may not behave well during a rollback.

Rather than attempting a rollback we recommend the following approaches:

1. **Roll Forward**: Address issues by applying fixes or configuration changes to the current version.
1. **Manual Intervention**: Where necessary perform manual "one-time" upgrade fixes to restore access. If there are persistent issues, these should be reported as [GitHub Issues](https://github.com/defenseunicorns/uds-core/issues) for the team to address going forward.
1. **Restore from Backup**: In critical situations, consider restoring from backups rather than attempting a version rollback.

If you encounter upgrade issues, it's important to:
- Re-review release notes to check if any known issues have been identified
- Check the [UDS Core GitHub Issues](https://github.com/defenseunicorns/uds-core/issues) for similar problems and solutions
- Open a new issue with detailed information about your environment and the problem
