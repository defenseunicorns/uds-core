# Troubleshooting Runbook Template

## About this template

Troubleshooting runbooks are operations-focused pages that help platform operators diagnose and resolve issues on a **running** UDS Core deployment. Each runbook covers a single problem area with a consistent structure: when to use it, diagnose root cause, fix, and verify.

Runbooks live under `docs/operations/troubleshooting-and-runbooks/` and are `.mdx` files styled consistently with the how-to guides.

### What belongs in a runbook

- Symptoms users observe on a running platform (error messages, pod states, broken functionality)
- Diagnostic commands to identify root cause (kubectl, istioctl, log queries)
- Step-by-step solutions for each common cause
- Verification that the fix worked
- Prevention guidance to avoid recurrence

### What does NOT belong

- Initial configuration or setup instructions (→ How-To Guides)
- Conceptual explanations of how things work (→ Concepts)
- Exhaustive configuration reference tables (→ Reference)
- Upgrade procedures (→ Operations > Upgrades)

## Template

```mdx
---
title: "Topic Name"
sidebar:
  order: X.X
---

import { Steps } from '@astrojs/starlight/components';

## When to use this runbook

<!-- For troubleshooting docs: describe observable symptoms and example errors -->
<!-- For procedural runbooks: describe the scenario that triggers this procedure -->

Use this runbook when:

- Trigger condition or observable symptom 1
- Trigger condition or observable symptom 2
- Error message or pod state (if applicable)

**Example error:**

\`\`\`plaintext title="Example error output"
Exact error message or log line the user would see
\`\`\`

## Common causes

This is typically caused by one of the following:

1. **Cause A** — brief explanation of why this happens
2. **Cause B** — brief explanation
3. **Cause C** — brief explanation

## Diagnostic steps

<Steps>

1. **Check the first thing**

   \`\`\`bash title="Check pod status"
   uds zarf tools kubectl get pods -n namespace
   \`\`\`

   **What to look for:** description of expected vs. actual state.

2. **Verify the second thing**

   \`\`\`bash title="Check logs"
   uds zarf tools kubectl logs -n namespace deploy/component --tail=50
   \`\`\`

   **Look for:** error patterns, warning messages.

3. **Examine the third thing**

   Continue with additional diagnostic steps as needed.

</Steps>

## Solutions

### Cause A: description

If diagnostics indicate this cause:

<Steps>

1. **First fix step**

   \`\`\`bash title="Apply the fix"
   command to fix
   \`\`\`

2. **Second fix step**

   Instructions or commands.

</Steps>

### Cause B: description

<Steps>

1. **Fix steps for cause B**

   Commands and instructions.

</Steps>

## Verification

After applying a fix, confirm the issue is resolved:

\`\`\`bash title="Verify fix"
uds zarf tools kubectl get pods -n namespace
\`\`\`

**Success indicators:**
- Indicator 1
- Indicator 2

## Prevention

<!-- OPTIONAL: Only include this section if there is a specific, non-obvious configuration
     or practice that prevents this issue. If the solution itself is the prevention, skip this section. -->

To avoid this issue in the future:

- Specific, actionable preventive measure

## Additional help

If this runbook doesn't resolve your issue:

1. Collect diagnostic output from the steps above
2. Check [UDS Core GitHub Issues](https://github.com/defenseunicorns/uds-core/issues) for known issues
3. Open a new issue with your diagnostic output attached

## Related documentation

- [Related How-To Guide](/how-to-guides/section/page/) — brief description
- [Related Concepts Page](/concepts/core-features/topic/) — brief description

```

## Conventions

### Structure
- Every runbook follows the same section order: When to use this runbook → Common causes → Diagnostic steps → Solutions → Verification → Prevention (optional) → Additional help → Related documentation
- **Prevention is optional** — only include it when there is a specific, non-obvious configuration or practice that prevents the issue. If the solution itself is the prevention, skip the section entirely.
- Diagnostic steps and per-cause solutions use the `<Steps>` component
- Solutions are organized per-cause, matching the "Common causes" list
- Keep sections focused — if a solution requires extensive configuration, link to the relevant how-to guide instead of duplicating it

### Formatting
- Files use `.mdx` extension
- Don't duplicate the frontmatter `title` as a top-level heading — Starlight renders it as the page `<h1>`
- Callouts: `> [!TIP]` for guidance, `> [!NOTE]` for caveats, `> [!CAUTION]` for data loss or breaking changes only
- Code blocks use titles: `` ```bash title="Check pod status" `` or `` ```plaintext title="Example error output" ``
- Error message examples use `plaintext` language with a descriptive title
- Use `uds zarf tools kubectl` instead of bare `kubectl` for consistency with UDS tooling

### Content guidance
- Write for operators running a live platform, not first-time installers
- Lead with **when** the operator needs this runbook — for troubleshooting docs, describe observable symptoms and example errors; for procedural runbooks, describe the scenario that triggers the procedure
- Diagnostic steps should be copy-pasteable commands that produce useful output
- Explain what to look for in command output — don't just say "check the logs"
- Solutions should be specific and actionable, not "contact support"
- Prevention section should include concrete configuration or monitoring recommendations
- Link to Reference for exact settings, Concepts only when understanding is needed

### Sidebar ordering
- Overview page: `order: 1.0`
- Runbook pages: `order: 1.1`, `1.2`, `1.3`, etc. — decimal ordering allows flexible insertion without renumbering

### Imports
- Always include: `import { Steps } from '@astrojs/starlight/components';`
- Only add `Tabs, TabItem` if the runbook has platform-specific or mode-specific variations

### Cross-linking
- Link to the how-to guide for the affected component when one exists
- Link to other runbooks when symptoms overlap
