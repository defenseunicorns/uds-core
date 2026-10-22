# Renovate triage report template

Return only one compact Markdown table in the conversation, without an enclosing code fence. Save the table to a Markdown file only when the user requests a destination.

## Output contract

Use exactly these three columns, in this order:

| PR number | Context | Action needed |
| --- | --- | --- |
| [#{{number}}]({{verified PR URL}}) | {{Dependency names and old/new versions; current actionable blocker.}} | {{Immediate maintainer task and expected result.}} |

Include PRs with a concrete action now or a material evidence gap. For image alignment, evaluate the resulting diff against base using the [alignment procedure](../SKILL.md#evaluate-the-diff-after-alignment). Require a remaining runtime image upgrade and GitHub evidence of a path through readiness, publication holds, and validation. Name the target and affected flavors or pins. Exclude empty rollbacks and Helm-only remainders. Auxiliary image upgrades such as curl count only if the remaining update can proceed; a nonempty diff alone is insufficient.

Publication, explicit holds, and existing runs alone do not create action items. Include independently repairable CI failures even while a hold remains, but state the hold and do not claim the repair makes the PR mergeable. Exclude repairs that depend on unresolved versions. During an active rerun, an older failed attempt alone does not establish a current repair. Exclude a candidate with a known remaining publication or readiness hold unless an independent repair qualifies. If missing evidence prevents you from establishing an alignment path, identify the specific gap as unverified instead of prescribing a downgrade.

Name the dependencies actually changed, not just a group label such as `support-deps`. Include old/new versions where available; identify digest-only updates without pasting digests. Group closely related packages concisely, such as `@typescript-eslint/{eslint-plugin,parser}`. For configuration migrations, name the configuration and substantive change.

Keep each context and action cell to one short sentence where possible. Start actions with the immediate task: repair, regenerate, resolve, review, or authorize. Do not use `wait`, `no action`, or a sequence of future steps as an action item.

Do not add headings, an introduction, a summary, priority labels, ages, publication evidence, or sections below the table. Order PRs by number ascending. Link the PR number to its verified URL and, when useful, link one causal job or maintainer comment in the context. Name an actor only when useful, using an evidenced assignee or role.

## Evidence and assumptions

Apply these rules while keeping the output small:

- Do not perform image lookups, registry queries, manifest inspection, tag searches, digest verification, or architecture checks.
- When the diff contains no image changes, assume image versions are up to date. Continue to assess actual CI, review, conflict, or maintainer-hold blockers without inventing image blockers.
- When the diff changes images, use current PR checks, readiness logs, and explicit holds. Check both the proposed common versions and the runtime image upgrades left after alignment. Include chart/application pins and CRD sources when they need alignment. Do not claim independently verified publication or assume one flavor's tag proves availability for another. Surface material gaps in the GitHub evidence.
- Exclude Helm-only updates, including Helm-only leftovers after alignment, unless verified urgent security impact requires action.
- Distinguish deliberate readiness exits and shim checks from failed or executed runtime tests.
- Preserve custom commits on edited/blocked branches; do not recommend reset or rebase/retry that would discard them.
- Assess every scoped PR internally, but report only actionable PRs and material evidence gaps. Do not silently omit access failures or unexamined changes as if they needed no action.
- Do not describe a PR as merge-ready without verifying applicable technical and review requirements.
- Do not paste full titles, logs, SHA inventories, command sequences, or sensitive material. Escape untrusted Markdown and HTML, escape table pipes as `\|`, and flatten cell newlines.

## Status rows

If inventory succeeds but no PR needs action now, return one row with `None`, `No open Renovate PRs need maintainer action now`, and `No action needed`.

If inventory succeeds and finds no open Renovate PRs, return one row with `None`, `No open Renovate PRs in scope`, and `No action needed`.

If inventory fails, return one row with `Unverified`, the access failure, and the access-recovery action. An inventory failure is not an empty or non-actionable backlog.

## Examples

These hypothetical rows illustrate actionable findings, not current evidence:

| PR number | Context | Action needed |
| --- | --- | --- |
| #100 | Grafana 12.0.0 to 12.0.1; generated check detects monitoring/standard schema drift with no active hold. | Regenerate both schemas and verify the generated check passes. |
| #102 | `renovate.json` replaces deprecated exclusion syntax; required approval missing. | Review the exclusion-rule migration and approve if acceptable. |
| #104 | Vector 0.59.0 to 0.60.0; edited/blocked branch; EKS fails on an RDS quota. | Resolve RDS capacity and rerun the affected check, preserving custom commits. |
| #105 | ESLint 9.0.0 to 9.1.0 and Vitest 3.0.0 to 3.0.1; installation fails on lockfile mismatch. | Repair the lockfile and verify installation and affected checks pass. |
| #106 | New commits arrived during the scan; current dependency changes and actionability remain unverified. | Inspect the new diff and current-head checks before choosing an action. |
| #107 | Example service updates from base 2.0.0 to flavor A 2.0.2 and flavors B/C 2.0.1; GitHub evidence supports alignment at 2.0.1 with no remaining publication hold. | Downgrade flavor A and related pins to 2.0.1, retaining the application upgrade and enabling validation. |
| #108 | Example service 2.0.0 to 2.0.1 remains publication-held; an independent lockfile mismatch blocks installation. | Repair the lockfile to unblock installation; the publication hold still prevents merging. |

Use these exclusion cases to check the result before rendering:

- Authservice base 1.1.8, upstream 1.1.9, other flavors 1.1.8: reverting upstream and chart/application pins to 1.1.8 removes the whole update. Omit the alignment row.
- Grafana image rollback leaves only chart changes: omit the alignment row. Do not recommend chart review, regeneration, or authorization to rescue it.
- Grafana image rollback leaves a curl upgrade: inspect readiness and holds for that remaining upgrade. Include only an evidenced alignment path, an independently repairable failure, or a specific unverified evidence gap. Do not assume the curl upgrade can proceed because it remains in the diff.
- A draft waits on publication while tests run: omit it unless evidence establishes an independent repair or a material evidence gap. Do not request generic review or duplicate tests.
