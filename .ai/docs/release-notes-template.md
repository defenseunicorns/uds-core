# Release Notes Template

## About this template

Release notes are version-specific pages that document what changed in a release, including breaking changes, notable features, and any version-specific upgrade considerations. Each page covers a single version.

Release notes live under `docs/operations/release-notes/`. Identity-config changes are inlined into the corresponding Core release notes page (not maintained as separate pages).

### File naming

Files are named by version number with hyphens replacing dots: `X-Y.mdx`

- Examples: `0-60.mdx`, `0-61.mdx`, `1-0.mdx`

### What belongs in a release notes page

- Breaking changes and their impact on existing deployments
- Notable features and improvements
- Version-specific upgrade considerations (only when they go beyond the standard procedure)
- Known issues and workarounds for this version
- Links to the GitHub release and related documentation

### What does NOT belong

- Standard upgrade procedures (→ Upgrade Overview at `docs/operations/upgrades/overview.mdx`)
- Prerequisites (→ Upgrade Overview)
- Standard post-upgrade verification (→ Upgrade Overview)
- First-time configuration instructions (→ How-To Guides)
- Conceptual explanations of how things work (→ Concepts)

## Template

```mdx
---
title: <Product> X.Y
sidebar:
  order: N.NNN
---

import { Steps } from "@astrojs/starlight/components";

## What changed

Summary of what changed in this version and why it matters to operators (2-3 sentences).

### Breaking changes

| Change                         | Impact                                          | Action required           |
| ------------------------------ | ----------------------------------------------- | ------------------------- |
| Description of breaking change | What breaks or changes for existing deployments | What the operator must do |

(Or "No breaking changes in this release." if none exist. Remove the table in that case.)

### Notable features

- **Feature name:** what it does and why it matters

### Dependency updates

| Package | Previous | Updated |
|---------|----------|---------|
| Package name | X.Y.Z | X.Y.Z |

## Upgrade considerations

<!-- OPTIONAL: Only include this section when version-specific steps exist beyond the standard
     upgrade procedure. Remove this entire section if there are no special considerations. -->

### Pre-upgrade steps

<Steps>

1. **Step description**

   Details and commands.

</Steps>

### Post-upgrade verification

<Steps>

1. **Step description**

   Details and commands.

</Steps>

## Related documentation

- [Upgrade Overview](/core/operations/upgrades/overview/) — general upgrade procedures and checklists
- [<Product> X.Y.0 Changelog](https://github.com/defenseunicorns/<repo>/blob/main/CHANGELOG.md#anchor) — full changelog
- [Full diff (X.W.0...X.Y.0)](https://github.com/defenseunicorns/<repo>/compare/vX.W.0...vX.Y.0) — all changes between versions
```

## Conventions

### Structure

- Every release notes page follows the same section order: What changed (with Breaking changes, Notable features, and Dependency updates subsections), Upgrade considerations (optional), Related documentation
- The "Upgrade considerations" section is **optional** — only include it when there are version-specific steps that go beyond the standard upgrade procedure in the overview. Remove it entirely if there are none.
- When "Upgrade considerations" is included, use `<Steps>` components for pre-upgrade and post-upgrade subsections
- Breaking changes use a table format with Change, Impact, and Action required columns

### Formatting

- Files use `.mdx` extension
- Don't duplicate the frontmatter `title` as a top-level heading. Starlight renders it as the page `<h1>`.
- Callouts: `> [!TIP]` for guidance, `> [!NOTE]` for caveats, `> [!IMPORTANT]` for things users should know, `> [!WARNING]` for potential issues, `> [!CAUTION]` for data loss or breaking changes only
- Code blocks use titles where applicable: ` ```yaml title="uds-bundle.yaml" `
- Use `uds zarf tools kubectl` instead of bare `kubectl`
- No `oci://` prefix on repository references
- Use `registry.defenseunicorns.com/public/core` for repository references
- Use em dashes (—) in Related documentation link descriptions
- Link to CHANGELOG.md anchor links (not GitHub release pages) for changelogs — anchor format is `#XY0-YYYY-MM-DD` (version with dots stripped, then date)
- Include a full diff link comparing the previous minor version tag to the current one

### Naming

- File name: `X-Y.mdx` with hyphens replacing dots in the version number
- Title: `UDS Core X.Y` (e.g., "UDS Core 0.63")

### Sidebar ordering

- Release notes use 3-decimal ordering within the `release-notes/` section: `3.001`, `3.002`, `3.003`, etc.
- Newer versions get higher order numbers so they appear later in the sidebar
- This scheme supports ~999 releases before ordering conflicts

### Overview page maintenance

- The release notes overview (`docs/operations/release-notes/overview.mdx`) shows only the latest 3 supported versions in its CardGrid
- When adding a new release notes page, also update the overview: add a card for the new version and remove the oldest card
- This matches the version support policy of 3 supported versions
- A maintainer comment in the MDX file documents this convention

### Identity Config updates

- When a Core release bumps `uds-identity-config`, add an `## Identity Config updates` section to that Core release notes page
- Place it after the Upgrade considerations section (or after Notable features if there are no upgrade considerations) and before Related documentation
- Include a brief intro line noting the identity-config version, then list notable changes as bullet points
- Add the identity-config changelog link to the Related documentation section
- Do not create separate identity-config release notes pages — all identity-config content is inlined into Core

### Content guidance

- Write for operators upgrading a running platform, not first-time installers
- Focus on what changed, what action is required (if any), and how to verify version-specific changes
- Be specific: include exact config paths, values, and commands
- Link to the Upgrade Overview for standard procedures — do not repeat them
- Always include a NOTE callout at the top linking to the Upgrade Overview
- The `import` line for Starlight components is only needed if the page uses `<Steps>` or other components
