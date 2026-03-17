# Upgrade Guide Template

## About this template

Upgrade guides are version-specific pages that walk operators through upgrading UDS Core between specific minor or major versions. Each guide covers a single version transition with its breaking changes, migration steps, and verification procedures.

Upgrade guides live under `docs/operations/upgrades/` and follow the naming convention `upgrade-core-X-Y-to-X-Z.mdx` (e.g., `upgrade-core-1-3-to-1-4.mdx`).

### What belongs in an upgrade guide

- Breaking changes and their impact on existing deployments
- Required migration steps with specific commands and configuration changes
- Pre-upgrade checks specific to this version transition
- Post-upgrade verification tailored to what changed
- Known issues and workarounds for this version

### What does NOT belong

- General upgrade procedures (→ Upgrade Overview)
- First-time configuration instructions (→ How-To Guides)
- Conceptual explanations of how things work (→ Concepts)
- Exhaustive configuration reference tables (→ Reference)
- Operational runbooks for incident response (→ Troubleshooting & Runbooks)

## Template

```mdx
---
title: Upgrade UDS Core X.Y to X.Z
sidebar:
  order: X.X
---

import { Steps, Tabs, TabItem, CardGrid, LinkCard } from '@astrojs/starlight/components';

> [!CAUTION]
> This guide covers specific changes for the X.Y → X.Z upgrade. For general upgrade procedures, see the [Upgrade Overview](/core/operations/upgrades/overview/).

## What changed

Summary of what changed in this version and why it matters to operators (2-3 sentences).

### Breaking changes

| Change | Impact | Action required |
|--------|--------|-----------------|
| Description of breaking change | What breaks or changes for existing deployments | What the operator must do |

### Notable features

Brief list of significant new features or improvements that operators should be aware of.

- **Feature name:** what it does and why it matters

## Prerequisites

- Running UDS Core version X.Y (or X.Y.z)
- [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) installed
- Access to a staging environment that mirrors production
- Recent backup of your deployment (see [Backup & Restore](/core/how-to-guides/backup-restore/overview/))

## Pre-upgrade checklist

<Steps>

1. **Review the full release notes**

   Read the [X.Z release notes](https://github.com/defenseunicorns/uds-core/releases) for the complete list of changes.

2. **Check for deprecated features**

   Review [DEPRECATIONS.md](https://github.com/defenseunicorns/uds-core/blob/main/DEPRECATIONS.md) for features deprecated in this or earlier versions. Resolve any deprecation warnings before upgrading.

3. **Verify version-specific prerequisites**

   <!-- Add version-specific checks here, e.g.: -->
   Confirm your current configuration is compatible with the changes listed above.

4. **Test in staging**

   Perform the upgrade in a staging environment before applying to production.

</Steps>

## Upgrade procedure

<Steps>

1. **Update your bundle reference**

   ```yaml title="uds-bundle.yaml"
   packages:
     - name: core
       repository: registry.defenseunicorns.com/public/core
       ref: X.Z.0-upstream
   ```

2. **Update configuration for breaking changes**

   <!-- Add specific config changes required for this version -->

   ```yaml title="uds-bundle.yaml"
   # Example: configuration change required by this version
   ```

3. **Build and deploy**

   ```bash
   uds create <path-to-bundle-dir>
   uds deploy uds-bundle-<name>-<arch>-<version>.tar.zst
   ```

</Steps>

## Post-upgrade verification

<Steps>

1. **Verify UDS Core components**

   ```bash
   uds zarf tools kubectl get pods -A | grep -v Running
   ```

   All pods should be in `Running` or `Completed` state.

2. **Validate SSO and endpoint access**

   Confirm all UDS Core UIs are accessible and SSO login works.

3. **Verify version-specific changes**

   <!-- Add checks specific to what changed in this version -->

4. **Verify mission applications**

   Confirm your applications are running and healthy.

</Steps>

## Known issues

<!-- List any known issues with this version transition and their workarounds -->

If you encounter issues not covered here:

1. Check [UDS Core GitHub Issues](https://github.com/defenseunicorns/uds-core/issues) for known problems
2. Open a new issue with details about your environment and the problem

## Related documentation

- [Upgrade Overview](/core/operations/upgrades/overview/) - general upgrade procedures and checklists
- [Configuration Changes](/core/operations/upgrades/configuration-changes/) - applying config changes and secret rotation
- [UDS Core X.Z Release Notes](https://github.com/defenseunicorns/uds-core/releases) - full changelog
```

## Conventions

### Structure
- Every upgrade guide follows the same section order: What changed, Prerequisites, Pre-upgrade checklist, Upgrade procedure, Post-upgrade verification, Known issues, Related documentation
- "Pre-upgrade checklist" and "Upgrade procedure" and "Post-upgrade verification" use the `<Steps>` component
- Breaking changes use a table format with Change, Impact, and Action required columns
- Known issues section should be removed entirely if there are no known issues for the version

### Formatting
- Files use `.mdx` extension
- Don't duplicate the frontmatter `title` as a top-level heading. Starlight renders it as the page `<h1>`.
- Callouts: `> [!TIP]` for guidance, `> [!NOTE]` for caveats, `> [!IMPORTANT]` for things users should know, `> [!WARNING]` for potential issues, `> [!CAUTION]` for data loss or breaking changes only
- Code blocks use titles where applicable: `` ```yaml title="uds-bundle.yaml" ``
- Use `uds zarf tools kubectl` instead of bare `kubectl`
- No `oci://` prefix on repository references
- Use `registry.defenseunicorns.com/public/core` for repository references

### Naming
- File name: `upgrade-core-X-Y-to-X-Z.mdx` with hyphens, no dots
- Title: `Upgrade UDS Core X.Y to X.Z`

### Sidebar ordering
- Upgrade guides use `order: 2.1`, `2.2`, `2.3`, etc. Decimal ordering allows flexible insertion.
- Newer versions get higher order numbers so they appear later in the list

### Content guidance
- Write for operators upgrading a running platform, not first-time installers
- Focus on what changed, what action is required, and how to verify success
- Be specific: include exact config paths, values, and commands
- Link to Reference for exact settings, Concepts only when understanding is needed
- Always include a CAUTION callout at the top linking back to the general Upgrade Overview
