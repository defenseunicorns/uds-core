# Troubleshooting Runbook Template

## About this template

Troubleshooting runbooks are operations-focused pages that help platform operators diagnose and resolve issues on a **running** UDS Core deployment. Each runbook covers a single problem area with a consistent structure: when to use it, diagnose root cause, fix, and verify.

Runbooks live under `docs/operations/troubleshooting-and-runbooks/` and are `.mdx` files styled consistently with the how-to guides.

### What belongs in a runbook

- Symptoms users observe on a running platform (error messages, pod states, broken functionality)
- Diagnostic commands to identify root cause (kubectl, istioctl, log queries)
- Step-by-step solutions for each common cause
- Verification that the fix worked

### What does NOT belong

- Initial configuration or setup instructions (→ How-To Guides)
- Conceptual explanations of how things work (→ Concepts)
- Exhaustive configuration reference tables (→ Reference)
- Upgrade procedures (→ Operations > Upgrades)

## Template

```mdx
---
title: Topic Name
sidebar:
  order: X.X
---

import { Steps } from '@astrojs/starlight/components';

## When to use this runbook

<!-- Trigger conditions and observable symptoms only. No context or background here. -->

Use this runbook when:

- Trigger condition or observable symptom 1
- Trigger condition or observable symptom 2
- Error message or pod state (if applicable)

**Example error:**

\`\`\`plaintext
Exact error message or log line the user would see
\`\`\`

## Overview

<!-- For troubleshooting docs: root cause summary and relevant architecture context -->
<!-- For procedural runbooks: why this procedure is needed and how the remediation works -->
<!-- Keep short and operationally relevant — avoid deep theory -->

This is typically caused by one of the following:

1. **Cause A** — brief explanation of why this happens
2. **Cause B** — brief explanation
3. **Cause C** — brief explanation

## Pre-checks

<!-- Things to verify before executing the procedure -->
<!-- For troubleshooting: log checks, metrics queries, confirming the problem exists -->
<!-- For procedural: permissions, cluster access, preconditions -->

<Steps>

1. **Check the first thing**

   \`\`\`bash
   uds zarf tools kubectl get pods -n namespace
   \`\`\`

   **What to look for:** description of expected vs. actual state.

2. **Verify the second thing**

   \`\`\`bash
   uds zarf tools kubectl logs -n namespace deploy/component --tail=50
   \`\`\`

   **Look for:** error patterns, warning messages.

3. **Examine the third thing**

   Continue with additional diagnostic steps as needed.

</Steps>

## Procedure

### Cause A: description

If diagnostics indicate this cause:

<Steps>

1. **First fix step**

   \`\`\`bash
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

\`\`\`bash
uds zarf tools kubectl get pods -n namespace
\`\`\`

**Success indicators:**
- Indicator 1
- Indicator 2

## Additional help

If this runbook doesn't resolve your issue:

1. Collect relevant details from the steps above
2. Check [UDS Core GitHub Issues](https://github.com/defenseunicorns/uds-core/issues) for known issues
3. Open a new issue with your relevant details attached

## Related Documentation

- [Related How-To Guide](/how-to-guides/section/page/) — brief description
- [Related Concepts Page](/concepts/core-features/topic/) — brief description

```

## Conventions

### Structure
- Every runbook follows the same section order: When to use this runbook → Overview → Pre-checks → Procedure → Verification → Additional help → Related Documentation
- "Pre-checks" and "Procedure" use the `<Steps>` component
- For troubleshooting runbooks, the Procedure section is organized per-cause with subsections matching the "Overview" list
- For procedural runbooks, Overview explains why the procedure is needed, "Pre-checks" covers preconditions, and Procedure is a single set of steps
- Keep sections focused — if a section requires extensive configuration, link to the relevant how-to guide instead of duplicating it
- Prevention tips should be `> [!TIP]` callouts inline within Procedure or Verification — do not create a separate Prevention section

### Formatting
- Files use `.mdx` extension
- Don't duplicate the frontmatter `title` as a top-level heading — Starlight renders it as the page `<h1>`
- Callouts: `> [!TIP]` for guidance, `> [!NOTE]` for caveats, `> [!CAUTION]` for data loss or breaking changes only
- Code blocks do not use `title` attributes — keep them clean (e.g., `` ```bash ``)
- Error message examples use `plaintext` language
- Use `uds zarf tools kubectl` instead of bare `kubectl` for consistency with UDS tooling

### Content guidance
- Write for operators running a live platform, not first-time installers
- **When to use this runbook**: trigger conditions and observable symptoms only — no context, background, or notes about defaults
- **Overview**: root cause summary, relevant architecture context, why the remediation works — keep short and operationally relevant, avoid deep theory
- **Pre-checks**: things to verify before executing — permissions, cluster access, diagnostics, confirming the symptom. For troubleshooting runbooks this includes log checks, metrics queries, and confirming the problem exists
- **Procedure**: the actual actions — numbered steps, copy-paste friendly, avoid explanation unless necessary
- Diagnostic steps should be copy-pasteable commands that produce useful output
- Explain what to look for in command output — don't just say "check the logs"
- Solutions should be specific and actionable, not "contact support"
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
