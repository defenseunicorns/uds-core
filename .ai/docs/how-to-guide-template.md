# How-To Guide Template

## About this template

How-to guides are task-oriented pages that walk a user through accomplishing a specific goal. Each guide covers a single task — configuring a component, enabling a feature, connecting an external dependency, etc.

How-to guides live under `docs/how-to-guides/<section>/` and are grouped by domain (e.g., high-availability, networking, identity-access). The section provides context; the page title should be the specific topic (e.g., "Keycloak", "Logging").

### What belongs in a how-to guide

- Step-by-step instructions to complete a specific configuration or task
- Bundle override YAML examples with `uds-bundle.yaml` and `uds-config.yaml`
- Verification commands to confirm success
- Brief troubleshooting for common issues

### What does NOT belong

- Conceptual explanations of how things work (→ Concepts section)
- Exhaustive configuration reference tables (→ Reference section)
- Operational runbooks for incident response (→ Operations section)

## Template

```mdx
---
title: Topic Name
sidebar:
  order: X.X
---

import { Steps, Tabs, TabItem, CardGrid, LinkCard } from '@astrojs/starlight/components';

## What you'll accomplish

Brief intro paragraph (2-3 sentences) explaining what the user will configure and why it matters.

## Prerequisites

- [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) installed
- Access to a Kubernetes cluster [qualifier, e.g., "(**multi-node**, multi-AZ recommended)"]
- [Guide-specific: external dependency, credential requirement, or knowledge prereq]

## Before you begin

<!-- Optional section. Use when the reader needs context about default behavior or architecture before the steps make sense. Keep it brief — if it's more than a few paragraphs, it belongs in Concepts. -->

Brief context about default behavior, architecture, or how the component works that the reader needs before following the steps.

## Steps

<Steps>

1. **First major step**

   Explanation of what this step does and why (1-2 sentences).

   ```yaml title="uds-bundle.yaml"
   packages:
     - name: core
       repository: registry.defenseunicorns.com/public/core
       ref: x.x.x-upstream
       overrides:
         component-name:
           chart-name:
             values:
               - path: config.path
                 value: "value"
             variables:
               - name: VARIABLE_NAME
                 path: config.secret.path
                 sensitive: true
   ```

   ```yaml title="uds-config.yaml"
   variables:
     core:
       VARIABLE_NAME: "your-value"
   ```

   > [!TIP]
   > Guidance about this step.

2. **Second major step**

   Explanation of what this step does.

   Use tables for component defaults when helpful:

   | Setting | Default | Override Path |
   |---|---|---|
   | Setting name | Default value | `helm.path` |

3. **Create and deploy your bundle**

   ```bash
   uds create <path-to-bundle-dir>
   uds deploy uds-bundle-<name>-<arch>-<version>.tar.zst
   ```

   <!-- Optional: include zarf package create only if the guide involves modifying a Zarf package -->
   <!-- If the guide requires rebuilding a Zarf package, add before the uds commands:
   ```bash
   uds zarf package create <path-to-package-dir>
   ```
   -->

</Steps>

## Verification

Confirm the configuration is active:

```bash
# Check component status
uds zarf tools kubectl get pods -n namespace
```

## Troubleshooting

### Problem description

**Symptom:** What the user sees.

**Solution:** How to fix it.

## Related Documentation

- [External Doc: Topic](https://example.com) — brief description
- [Internal Doc: Topic](/path/to/page/) — brief description

## Next steps

These guides and concepts may be useful to explore next:

<CardGrid>
  <LinkCard
    title="Related Guide"
    description="Why this is a natural next step."
    href="/how-to-guides/section/page/"
  />
  <LinkCard
    title="Related Concepts"
    description="Background on how this works in UDS Core."
    href="/concepts/core-features/topic/"
  />
</CardGrid>
```

## Conventions

### Prerequisites
- Always list: **UDS CLI installed** and **Access to a Kubernetes cluster** (with guide-specific qualifiers like "(**multi-node**, multi-AZ recommended)")
- Guide-specific items: external dependencies (e.g., external PostgreSQL), credential requirements, knowledge prereqs (e.g., familiarity with bundle overrides)

### General
- Use an optional "Before you begin" section for context about defaults or architecture — keep steps action-only
- Do not use `---` horizontal rule dividers between sections — headings provide sufficient visual separation
- When a step has multiple options (pick-one), use `<Tabs>` and `<TabItem>` components within the step rather than listing options with bold headings
- Files use `.mdx` extension
- Page titles are bare topic names — breadcrumbs provide section context
- Callouts: `> [!TIP]` for guidance, `> [!NOTE]` for caveats, `> [!IMPORTANT]` for things users should know, `> [!WARNING]` for potential issues, `> [!CAUTION]` for data loss or breaking changes only
- Code blocks use titles: `` ```yaml title="uds-bundle.yaml" ``
- No `oci://` prefix on repository references
- Use `values` for static config, `variables` for secrets/environment-specific
- Add `sensitive: true` to password and secret variables
- The final step should be "Create and deploy your bundle" with explicit `uds create` and `uds deploy` commands (omit for usage-only guides that don't modify configuration, e.g., querying logs)
- Only include `zarf package create` if the guide involves modifying a Zarf package — most guides only use bundle overrides and don't need it
- Related Documentation comes before Next Steps
- Next Steps uses `<CardGrid>` with `<LinkCard>` components
- For optional steps, put `(Optional)` at the beginning of the step heading: `**(Optional) Step name**` (per [Google](https://developers.google.com/style/procedures#optional-steps) and [Microsoft](https://learn.microsoft.com/en-us/style-guide/procedures-instructions/writing-step-by-step-instructions) style guides)
- Verify all helm paths against source `values.yaml` and all upstream URLs before publishing
