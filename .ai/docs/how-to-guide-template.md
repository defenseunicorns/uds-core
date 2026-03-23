# How-To Guide Template

> This template extends the rules in [docs/dev/style-rules.md](../../docs/dev/style-rules.md) and [docs/dev/voice-profile.md](../../docs/dev/voice-profile.md). Only template-specific conventions appear below.

## About this template

How-to guides are task-oriented pages that walk a user through accomplishing a specific goal. Each guide covers a single task (configuring a component, enabling a feature, connecting an external dependency, etc.).

How-to guides live under `docs/how-to-guides/<section>/` and are grouped by domain (e.g., high-availability, networking, identity-and-authorization). The section provides context; the page title should be the specific topic (e.g., "Keycloak", "Logging").

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

import { Steps, Tabs, TabItem } from '@astrojs/starlight/components';
{/* Only add CardGrid / LinkCard if this is an overview/landing page - how-to guides do not use those components. */}

## What you'll accomplish

Brief intro paragraph (2-3 sentences) explaining what the user will configure and why it matters.

## Prerequisites

- [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) installed
- [UDS Registry](https://registry.defenseunicorns.com) account created and authenticated locally with a read token <!-- include if guide references registry.defenseunicorns.com packages -->
- Access to a Kubernetes cluster [qualifier, e.g., "(**multi-node**, multi-AZ recommended)"]
- [Guide-specific: external dependency, credential requirement, or knowledge prereq]

## Before you begin

<!-- Optional section. Use when the reader needs context about default behavior or architecture before the steps make sense. Keep it brief; if it's more than a few paragraphs, it belongs in Concepts. -->

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

3. **Deploy your application**

   <!-- Use ONE of the patterns below depending on the guide type -->

   <!-- Pattern A: Guide only modifies Core via bundle overrides -->
   ```bash
   uds create <path-to-bundle-dir>
   uds deploy uds-bundle-<name>-<arch>-<version>.tar.zst
   ```

   <!-- Pattern B: Guide creates application resources (Package CRs, ConfigMaps, PrometheusRules, etc.) -->
   **(Recommended)** Include the [resource] in your Zarf package and create/deploy. See [Packaging applications](/how-to-guides/packaging-applications/overview/) for general packaging guidance.

   ```bash
   uds zarf package create --confirm
   uds zarf package deploy zarf-package-*.tar.zst --confirm
   ```

   **Or** apply the [resource] directly for quick testing:

   ```bash
   uds zarf tools kubectl apply -f manifest.yaml
   ```

</Steps>

## Verification

Confirm the configuration is active:

```bash
# Check component status
uds zarf tools kubectl get pods -n namespace
```

## Troubleshooting

### Problem: Short description of the issue

**Symptom:** What the user sees.

**Solution:** How to fix it.

## Related documentation

- [External Doc: Topic](https://example.com) - brief description
- [Internal Doc: Topic](/path/to/page/) - brief description
- [Related Guide](/how-to-guides/section/page/) - Why this is a related guide.
- [Related Concepts](/concepts/core-features/topic/) - Background on how this works in UDS Core.
```

## Conventions

### Prerequisites
- Always list: **UDS CLI installed** and **Access to a Kubernetes cluster** (with guide-specific qualifiers like "(**multi-node**, multi-AZ recommended)")
- If the guide references `registry.defenseunicorns.com` packages (e.g., bundle YAML with `repository: registry.defenseunicorns.com/...`), include: **[UDS Registry](https://registry.defenseunicorns.com) account created and authenticated locally with a read token**
- Guide-specific items: external dependencies (e.g., external PostgreSQL), credential requirements, knowledge prereqs (e.g., familiarity with bundle overrides)

### General
- Use an optional "Before you begin" section for context about defaults or architecture; keep steps action-only
- Do not use `---` horizontal rule dividers between sections; headings provide sufficient visual separation
- When a step has multiple options (pick-one), use `<Tabs>` and `<TabItem>` components within the step rather than listing options with bold headings
- Files use `.mdx` extension
- Page titles are bare topic names; breadcrumbs provide section context
- Frontmatter `title:` must not use surrounding quotes (e.g. `title: Policy Violations`, not `title: "Policy Violations"`). Quotes are unnecessary in YAML for plain strings and create inconsistency
- Do not repeat the frontmatter `title:` as a `##` heading in the page body. Starlight renders the title automatically as the page's `<h1>`; a duplicate heading creates redundant visual hierarchy
- The related links section must be headed `## Related documentation` (sentence case), not `## Related Documentation` or any other casing
- Callouts: `> [!TIP]` for guidance, `> [!NOTE]` for caveats, `> [!IMPORTANT]` for things users should know, `> [!WARNING]` for potential issues, `> [!CAUTION]` for data loss or breaking changes only
- Code blocks use titles: `` ```yaml title="uds-bundle.yaml" ``
- No `oci://` prefix on `repository` field values in `uds-bundle.yaml` (Zarf CLI commands like `zarf package publish` do require the `oci://` prefix)
- Use `values` for static config, `variables` for secrets/environment-specific
- Add `sensitive: true` to password and secret variables
- For guides that only modify Core via bundle overrides: the final step should be "Create and deploy your bundle" with explicit `uds create` and `uds deploy` commands (omit for usage-only guides that don't modify configuration, e.g., querying logs)
- For guides where the user creates application resources (Package CRs, ConfigMaps, PrometheusRules, etc.): the deploy step should show Zarf package create/deploy as the **(Recommended)** approach first, with `kubectl apply` as a secondary **Or** option for quick testing. Include a link to [Packaging applications](/how-to-guides/packaging-applications/overview/) for general packaging guidance. Follow this pattern:

  ```markdown
  X. **Deploy step title**

     **(Recommended)** Include the [resource] in your Zarf package and create/deploy. See [Packaging applications](/how-to-guides/packaging-applications/overview/) for general packaging guidance.

     ```bash
     uds zarf package create --confirm
     uds zarf package deploy zarf-package-*.tar.zst --confirm
     ```

     **Or** apply the [resource] directly for quick testing:

     ```bash
     uds zarf tools kubectl apply -f manifest.yaml
     ```
  ```
- How-to guides use a single `## Related documentation` section with a flat bullet list. No `## Next steps` section. All links (reference docs, external resources, follow-up guides, related concepts) go in this one section as bullets.
- Overview/landing pages (e.g., `overview.mdx` files that introduce a section) may use `<CardGrid>` and `<LinkCard>` for visual navigation. The bullets-only convention applies to how-to guide body content only.
- For optional steps, put `(Optional)` at the beginning of the step heading: `**(Optional) Step name**`
- Troubleshooting headings use the `### Problem: Description` format, with `**Symptom:**` (singular) or `**Symptoms:**` (plural) and `**Solution:**` sub-headings
- Verify all helm paths against source `values.yaml` and all upstream URLs before publishing

### Bundle override verification checklist

When writing or reviewing bundle override examples, verify each of these before publishing:

1. **Component name:** Must match a named component in `packages/standard/zarf.yaml`. Check the `name:` fields under `components:` in that file.

2. **Chart name:** Must match the `name:` field of a chart entry in the component's `zarf.yaml` or `common/zarf.yaml` under `src/`. Note that the `src/` directory name doesn't always match the component name (e.g., component `kube-prometheus-stack` lives in `src/prometheus-stack/`). The chart name is often NOT the same as the component name. For example, the `falco` component has charts named `falco` and `uds-falco-config`.

3. **Value path:** Must be a valid Helm value path for the referenced chart. For UDS config charts, verify against `src/<component>/chart/values.yaml`. For upstream charts, verify against `src/<component>/values/values.yaml` (local customizations) or the upstream chart's default values.

4. **Secrets identification:** Webhook URLs, API tokens, storage access keys, and any credential-like values are secrets, not just passwords. If a value would grant access to a system if leaked, treat it as a secret.

5. **Values vs variables:** If a value is environment-specific AND contains credentials, tokens, or keys, always use a `variable` with `sensitive: true` and include a `uds-config.yaml` example showing how to pass it at deploy time. Only use `values` for configuration that is safe to embed in the bundle artifact.
