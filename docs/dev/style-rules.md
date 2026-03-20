# Style Rules

These rules apply to all documentation output. They take precedence over generic writing defaults.
Load this file before any review or writing pass and apply throughout.

## Tone and voice

- Use active voice. Avoid passive voice.
- Front-load key information: most important thing first, every time.
- Write plainly. No cliches, colloquialisms, jargon, or unclear analogies.
- Be crisp and clear. Simple over clever.
- Be warm and human, not robotic or overly formal.
- Be technically correct. When in doubt, flag rather than guess.
- Don't repeat information. Link to it instead.
- No emojis in documentation. The ⚠ symbol is allowed as a severity indicator in headings (for example, breaking changes).
- No emdashes. Use commas, colons, semicolons, or parentheses instead.

## General guidelines

- Use sentence case for all headings (capitalize only the first word and proper nouns).
- Use proper heading hierarchy: H1 -> H2 -> H3. Never skip levels.
- Do not use `---` horizontal rule dividers between sections. Headings provide sufficient visual separation.
- Include descriptive alt text for all images.
- Use relative links for internal references.
- Anchor lists with an introductory sentence. Avoid placing a list directly under a heading with no lead-in, except for simple link-list sections (for example, **Related documentation**) where the section is just a list of links.
- Use second-person ("you") when addressing the reader. Avoid first-person pronouns.
- Use "airgap" (one word). Use "the airgap" not "airgap environment".
- Files use `.mdx` extension for published docs.

## Code and commands

- Use backticks for inline code, commands, and file paths.
- Use fenced code blocks with language specification for all multi-line code.
- Use `bash` highlighting for shell commands.
- Add a `title` attribute to code blocks when showing file content:
  ````md
  ```yaml title="uds-bundle.yaml"
  packages:
    - name: core
  ```
  ````
- Include inline comments in code blocks to explain configuration fields, especially in YAML. Comment every non-obvious field so readers understand what each value does and why:
  ```yaml
  # Enable retention enforcement in the compactor
  - path: loki.compactor.retention_enabled
    value: true
  # How often the compactor runs compaction and retention sweeps (Loki default: 10m)
  - path: loki.compactor.compaction_interval
    value: "10m"
  ```
- No trailing whitespace in code blocks.

## Formatting

- **Bold** for UI elements, emphasis, and step titles in numbered lists.
- *Italics* sparingly, only for introducing new terms.
- Tables for structured data comparison.
- Numbered lists for sequential steps.
- Bullet lists for unordered items.

## Starlight/Astro components

Published docs use Astro Starlight components for interactive elements. Import only the components you use:

```mdx
import { Steps, Tabs, TabItem, CardGrid, LinkCard } from '@astrojs/starlight/components';
```

- `<Steps>`: wrap numbered step lists for visual styling
- `<Tabs>` / `<TabItem>`: use within a step when the reader must choose between options (e.g., different auth methods)
- `<CardGrid>` / `<LinkCard>`: use for "Next steps" navigation at the end of a page

## Callout syntax

Published docs use GFM alert syntax. Use each type for its intended purpose:

```md
> [!TIP]
> Guidance and helpful advice for better usage.

> [!NOTE]
> Caveats or supplementary information the reader should be aware of.

> [!IMPORTANT]
> Essential information necessary for successful completion of a task.

> [!WARNING]
> Potential issues that could cause problems if ignored.

> [!CAUTION]
> Risk of data loss or breaking changes only.
```

Use disclosure widgets for supplementary details not all readers need:

```md
<details>
<summary>Click to expand</summary>

Additional details that don't need to be visible by default.
</details>
```

## Content structure

- Start with a clear, concise introduction.
- Group related content under appropriate headings.
- Place most important information first.
- Use examples to illustrate concepts.
- Include troubleshooting sections for common issues. Use the symptom/solution pattern:
  ```md
  ### Problem description

  **Symptom:** What the user sees.

  **Solution:** How to fix it, with a verification command if applicable.
  ```
- End with a Related documentation section.

## Terminology

- Be consistent with technical terms throughout the document.
- Define acronyms on first use.
- Use standard industry terminology.
- Maintain consistent capitalization for product names.

## Links and references

- Use descriptive link text. Never "click here."
- Verify all links are valid before publishing.
- Use anchor links for navigation within long documents.
- Related Documentation section comes before Next Steps.
- Format related docs as a bullet list with brief descriptions:
  ```md
  - [External Doc: Topic](https://example.com) - brief description
  - [Internal Doc: Topic](/path/to/page/) - brief description
  ```

## Quick checklist (run before delivering any section)

- [ ] Active voice throughout?
- [ ] Headings in sentence case?
- [ ] Every list has an introductory sentence?
- [ ] No inline jargon left unexplained?
- [ ] Code blocks have language specifiers and `title` attributes where applicable?
- [ ] YAML code blocks have inline comments explaining config fields?
- [ ] "you" used instead of "I/we" for reader address?
- [ ] Callouts use `> [!TYPE]` GFM alert syntax?
- [ ] No `---` horizontal rule dividers?
- [ ] No emdashes?
- [ ] No emojis?
