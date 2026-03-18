# Release Notes Template

## About this template

Release notes are version-specific pages that document what changed in a release, including breaking changes, notable features, and any version-specific upgrade considerations. Each page covers a single version.

Release notes live under `docs/operations/release-notes/` in product-specific subdirectories:

- `docs/operations/release-notes/core/` — UDS Core release notes
- `docs/operations/release-notes/identity-config/` — UDS Identity Config release notes

### File naming

Files are named by version number with hyphens replacing dots: `X-Y.mdx`

- UDS Core examples: `0-60.mdx`, `0-61.mdx`, `1-0.mdx`
- Identity Config examples: `0-24.mdx`, `0-25.mdx`

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
- [<Product> X.Y.0 Release Notes](github-release-url) — full changelog
```

## Conventions

### Structure

- Every release notes page follows the same section order: What changed (with Breaking changes and Notable features subsections), Upgrade considerations (optional), Related documentation
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

### Naming

- File name: `X-Y.mdx` with hyphens replacing dots in the version number
- Title: `<Product> X.Y` (e.g., "UDS Core 0.63", "UDS Identity Config 0.24")
- Product name in title matches the subdirectory: `core/` → "UDS Core", `identity-config/` → "UDS Identity Config"

### Sidebar ordering

- Release notes use 3-decimal ordering within the `release-notes/` section: `3.001`, `3.002`, `3.003`, etc.
- Each product subdirectory has its own ordering sequence starting at `3.001`
- Newer versions get higher order numbers so they appear later in the sidebar
- This scheme supports ~999 releases per product before ordering conflicts

### Content guidance

- Write for operators upgrading a running platform, not first-time installers
- Focus on what changed, what action is required (if any), and how to verify version-specific changes
- Be specific: include exact config paths, values, and commands
- Link to the Upgrade Overview for standard procedures — do not repeat them
- Always include a NOTE callout at the top linking to the Upgrade Overview
- The `import` line for Starlight components is only needed if the page uses `<Steps>` or other components
