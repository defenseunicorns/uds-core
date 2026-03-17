# Reference Page Template

## About this template

Reference pages document stable UDS Core configuration surfaces — the exact fields, defaults, and behaviors that bundle operators and platform engineers need to look up. They are **not** task-oriented.

Reference pages live under `docs/reference/<section>/` and use the `.md` extension unless Starlight components (Tabs, Steps, CardGrid, LinkCard) are needed, in which case use `.mdx`.

### What belongs in a reference page

- Field-level tables with types, defaults, and descriptions
- Concise explanation of what each configuration surface controls
- Minimal working examples (e.g., a bundle override snippet) to illustrate how fields map to deployment config
- Behavior notes that are not obvious from field names (e.g., "values in `realmInitEnv` only apply at initial realm import")
- Links to how-to guides for task-oriented usage

### What does NOT belong

- Step-by-step instructions (→ How-to Guides)
- Conceptual explanations of how things work (→ Concepts section)
- Troubleshooting steps (→ How-to Guides or Operations)
- Section headers like "What you'll accomplish", "Prerequisites", "Steps", "Verification" (those are how-to guide sections)

## Template

```md
---
title: Section Name
sidebar:
  order: X.X
---

One or two sentences describing what UDS Core configures in this area and why it matters to bundle operators. Keep it narrow — only UDS Core-specific surfaces, not a general introduction to the underlying technology.

## Configuration surface one

One sentence describing what this section covers.

| Field | Type | Default | Description |
|---|---|---|---|
| `field.name` | string | `"default"` | What this field controls |
| `field.other` | boolean | `false` | What this field controls |

> [!NOTE]
> Any behavior note that isn't obvious from the table — e.g., when changes take effect, mutual exclusion, or ordering constraints.

Minimal example showing the bundle override path:

\`\`\`yaml
overrides:
  component:
    chart-name:
      values:
        - path: field.name
          value: "your-value"
\`\`\`

## Configuration surface two

...

## Related documentation

- [How-to guide title](/how-to-guides/section/page/) — brief description
- [Upstream doc title](https://example.com) — brief description
- [Concepts page title](/concepts/section/page/) — brief description
```

## Conventions

### Structure
- Opening paragraph: 1–2 sentences, no heading, describes what UDS Core surfaces in this area
- `##` headings for each logical configuration surface
- `###` for sub-sections when a surface has meaningfully distinct sub-areas
- End with `## Related documentation` — no "Next steps" or CardGrid (those are how-to guide patterns)
- No horizontal rule (`---`) dividers between sections

### Tables
- Four-column format: `| Field | Type | Default | Description |`
- Use `—` for fields with no default or that are required
- Wrap field names in backticks: `` `field.name` ``
- For enum types, list values: `` `value1` \| `value2` ``

### Code examples
- Use fenced YAML blocks; add `title="..."` only when the file name adds clarity
- Show only the relevant override path — do not include `packages:`, `repository:`, or `ref:` boilerplate unless needed to show context
- Never use `oci://` prefix on repository references
- Use `registry.defenseunicorns.com/public/core` for UDS Core repository references (no `oci://` prefix)

### Alert syntax
- `> [!NOTE]` — caveats, timing constraints, non-obvious behavior
- `> [!TIP]` — helpful hints (use sparingly in reference pages)
- `> [!CAUTION]` — data loss or security risk
- `> [!WARNING]` — potential issues

### Callout usage
- Minimize callouts in reference pages — most information belongs in the table itself or prose
- Use `> [!NOTE]` for timing constraints (e.g., "requires redeployment to take effect")
- Use `> [!CAUTION]` for security implications only

### Related documentation
- List external upstream docs (e.g., Keycloak, Istio) with brief descriptions
- List related how-to guides (task-oriented usage of the fields documented here)
- List related concepts pages (background reading)
- You may link to reference pages in other subsections (e.g., `operator-and-crds`) when they are the most relevant pointer; prefer inline links for reference pages within the same subsection
