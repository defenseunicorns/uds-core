---
name: draft-release-notes
description: Draft or update UDS Core release notes page and Slack announcement from the release-please PR. Use this skill whenever the user mentions release notes, preparing a release, writing release announcements, updating release pages, or anything related to documenting a new UDS Core version. Also use it when the user says things like "prep the release", "write up the release", "draft release notes", or references a release-please PR.
argument-hint: [version]
disable-model-invocation: true
---

# UDS Core Release Notes Skill

This skill guides the creation of release notes pages and Slack announcements for UDS Core releases.

## Before you start

Read these files for template, conventions, and style reference:
- `.ai/docs/release-notes-template.md` — the authoritative template and all formatting conventions. Follow it exactly.
- The most recent `.mdx` file in `docs/operations/release-notes/` — for real-world style reference

## Step 1: Determine release type

Ask the user if not obvious:
- **Minor release** (e.g., 0.64) — create a new release notes page
- **Patch release** (e.g., 0.63.1) — update the existing minor version's page with a CAUTION callout and known issues section
- **Major release** — same as minor but version format changes (e.g., 1.0)

## Step 2: Gather changes from release-please PR

Use `gh` CLI to find and analyze the release-please PR:

```bash
# Find the open release-please PR
gh pr list --repo defenseunicorns/uds-core --label "autorelease: pending" --json number,title,body
```

From the PR body, extract all merged PR references. Then fetch details for each to understand the changes:

```bash
# Get the full body of the release-please PR
gh pr view <PR_NUMBER> --repo defenseunicorns/uds-core --json body,title
```

For each included PR, categorize it:
- **Breaking changes** — look for `!` in conventional commit type (e.g., `feat!:`, `chore!:`)
- **Notable features** — `feat:` commits that add user-visible functionality
- **Bug fixes** — `fix:` commits, especially prominent ones
- **Dependency updates** — `chore(deps):` commits; extract package name + old/new version
- **Chores/docs/refactors** — usually not called out individually unless significant

To get dependency version details, read the actual PR diffs when needed:

```bash
gh pr view <DEP_PR_NUMBER> --repo defenseunicorns/uds-core --json title,body
```

## Step 3: Gather dependency updates

Review all `chore(deps):` PRs in the release. Include both **application updates** and **Helm chart version bumps** in a single dependency table. Application updates track the actual running software (e.g., Prometheus 3.10.0, Grafana 12.4.1). Helm chart bumps track the chart packaging version (e.g., kube-prometheus-stack 82.13.5, Grafana Helm chart 11.3.3).

For Helm chart entries, add a "Helm chart" suffix to the package name (e.g., "Falco Helm chart", "Grafana Helm chart", "kube-prometheus-stack Helm chart"). Skip Helm charts where the chart version always matches the application version (e.g., Istio charts). Skip local/internal charts (keycloak, authservice, uds-operator-config, uds-cluster-crds). Skip test-only charts (podinfo).

**Do NOT include:**
- Support library updates (e.g., zarf-agent, uds-runtime)
- GitHub Actions or CI tooling updates
- Go module or build dependency updates

**When in doubt, ask the user** whether a specific dependency should be included. If they provide guidance on a dependency you weren't sure about, update this skill's SKILL.md to include that guidance for future runs.

For each included dependency, extract the previous and updated version numbers from the **actual PR diff** (e.g., image tags in `zarf.yaml` or `values.yaml`), not from the PR title. The version in the PR title may not accurately reflect the actual application version. The application version is what belongs in the release notes table.

In the dependency table, link the "Updated" version number to the upstream release page (GitHub release or project release page). Use these URL patterns:

- Istio: `https://istio.io/latest/news/releases/X.Y.x/announcing-X.Y.Z/`
- Keycloak: `https://github.com/keycloak/keycloak/releases/tag/X.Y.Z`
- Prometheus: `https://github.com/prometheus/prometheus/releases/tag/vX.Y.Z`
- Alertmanager: `https://github.com/prometheus/alertmanager/releases/tag/vX.Y.Z`
- Grafana: `https://github.com/grafana/grafana/releases/tag/vX.Y.Z`
- Loki: `https://github.com/grafana/loki/releases/tag/vX.Y.Z`
- Velero: `https://github.com/vmware-tanzu/velero/releases/tag/vX.Y.Z`
- Vector: `https://github.com/vectordotdev/vector/releases/tag/vX.Y.Z`
- Pepr: `https://github.com/defenseunicorns/pepr/releases/tag/vX.Y.Z`
- Falco: `https://github.com/falcosecurity/falco/releases/tag/X.Y.Z`
- UDS Identity Config: `https://github.com/defenseunicorns/uds-identity-config/releases/tag/vX.Y.Z`
- Prometheus Operator: `https://github.com/prometheus-operator/prometheus-operator/releases/tag/vX.Y.Z`
- Metrics-Server: `https://github.com/kubernetes-sigs/metrics-server/releases/tag/vX.Y.Z`
- K8s-Sidecar: `https://github.com/kiwigrid/k8s-sidecar/releases/tag/X.Y.Z`
- Falcosidekick: `https://github.com/falcosecurity/falcosidekick/releases/tag/X.Y.Z`
- Blackbox Exporter: `https://github.com/prometheus/blackbox_exporter/releases/tag/vX.Y.Z`
- Authservice: `https://github.com/istio-ecosystem/authservice/releases/tag/vX.Y.Z`
- Node Exporter: `https://github.com/prometheus/node_exporter/releases/tag/vX.Y.Z`
- Kube State Metrics: `https://github.com/kubernetes/kube-state-metrics/releases/tag/vX.Y.Z`

When a Helm chart version is bumped independently of the application version, include it in the same dependency table with a "Helm chart" suffix (e.g., "Falco Helm chart", "Grafana Helm chart"). Link the updated version to the chart's release page using these patterns:

- Falco Helm chart: `https://github.com/falcosecurity/charts/releases/tag/falco-X.Y.Z`
- Grafana Helm chart: `https://github.com/grafana-community/helm-charts/releases/tag/grafana-X.Y.Z`
- Istio Helm chart: `https://github.com/istio/istio/releases/tag/X.Y.Z` (chart version matches app version)
- kube-prometheus-stack Helm chart: `https://github.com/prometheus-community/helm-charts/releases/tag/kube-prometheus-stack-X.Y.Z`
- Loki Helm chart: `https://github.com/grafana-community/helm-charts/releases/tag/loki-X.Y.Z`
- Metrics Server Helm chart: `https://github.com/kubernetes-sigs/metrics-server/releases/tag/metrics-server-helm-chart-X.Y.Z`
- Prometheus Blackbox Exporter Helm chart: `https://github.com/prometheus-community/helm-charts/releases/tag/prometheus-blackbox-exporter-X.Y.Z`
- prometheus-operator-crds Helm chart: `https://github.com/prometheus-community/helm-charts/releases/tag/prometheus-operator-crds-X.Y.Z`
- Vector Helm chart: `https://github.com/vectordotdev/helm-charts/releases/tag/vector-X.Y.Z`
- Velero Helm chart: `https://github.com/vmware-tanzu/helm-charts/releases/tag/velero-X.Y.Z`

Leave entries unlinked when there is no meaningful upstream release page (e.g., DoD CA Certs).

## Step 4: Check for identity-config changes

Look for any `uds-identity-config` version bump in the included PRs. If found:

```bash
# Check the identity-config release for notable changes
gh release view v<VERSION> --repo defenseunicorns/uds-identity-config --json body
```

This content gets inlined into the Core release notes per the template conventions.

## Step 5: Identify manual upgrade steps

Before writing the release notes, ask the user whether there are any manual upgrade steps required for this release. This applies to both Core changes and identity-config changes.

**For Core changes**, check for:
- Breaking changes that require operator action (config migrations, removed fields, renamed values)
- Helm chart major version bumps that may break custom overrides
- Changes to CRD schemas that require manifest updates
- Any PR descriptions that mention "migration", "manual", "breaking", or "action required"

**For identity-config changes**, check for:
- Manual realm changes (e.g., new required realm settings, attribute changes)
- Theme or plugin updates that require manual steps
- Any notes in the identity-config release about manual intervention

Ask the user directly: "Are there any manual upgrade steps operators need to perform for this release — either for Core or identity-config?" If they describe steps, include them in the Upgrade considerations section using the `<Steps>` component format from the template. If they're unsure, flag the specific changes that look like they might need manual steps and ask for confirmation.

## Step 6: Write the release notes page

### For minor/major releases — create new file

Follow the template from `.ai/docs/release-notes-template.md`. Determine the `sidebar.order` by looking at the most recent release notes file and using the next lower 3-decimal value (for example: `3.999`, `3.998`, `3.997`, … — decrement by `0.001`).

### For patch releases — update existing file

Add to the existing minor version's release notes:
- An `> [!CAUTION]` callout in the Upgrade considerations section noting what's fixed
- A "Known issues" subsection if applicable
- Update the full diff link to reflect the new patch version

### Update the overview page

For minor/major releases, update `docs/operations/release-notes/overview.mdx`:
- Add a new `<LinkCard>` for the new version at the top
- Remove the oldest one (keep only 3)
- Write a brief description summarizing the key features and changes — do not mention dependency version bumps in the LinkCard description unless they are truly significant (e.g., a major version bump that causes breaking changes)

## Step 7: Generate Slack announcement

After the release notes page is written, generate a Slack-friendly announcement message in a code block the user can copy-paste.

### Determine the release name

Map the minor version number to a letter of the alphabet (modulo 26 for numbers > 26). For example:
- 0.20 → letter 20 → T
- 0.64 → 64 mod 26 = 12 → L

Generate 5-8 fun name options using the pattern adjective + animal, both starting with that letter. Mix up the vibes — some playful, some majestic, some silly. Present them to the user and let them pick their favorite. For example, for "L": Luminous Lemur, Legendary Lynx, Lively Lobster, Lavish Leopard, etc.

### Slack message format

```
This release includes <features, bug fixes, CVE fixes, etc as applicable>. You can view the full release notes on the docs site [here](<docs-site-link>).

Some particular changes of note:
- <List any significant features included>
- <List any significant bug fixes (focus on any prominent/very public bugs)>
- Full dependency updates (<docs-site-link>#dependency-updates)

As per usual please reach out in #product-support if you encounter any issues consuming this release.
<Also note if we are tracking any bugs or CVEs that we know will be fixed soon in a patch>
```

Instead of listing individual dependency updates in the Slack message, link to the dependency updates section of the release notes page. Use the anchor `#dependency-updates` on the docs site URL.

Also provide the metadata for the Slack workflow:
- **Announcement Tier:** Let the user decide this
- **Breaking Changes:** Yes/No based on release content
- **Responsible Team:** `@uds-foundation-team`
- **Release URL:** `https://github.com/defenseunicorns/uds-core/releases/tag/v<VERSION>`
- **Release Title:** `UDS Core <version> ("<name>")` (name only for minor/major)
- **Docs site link:** `https://docs.defenseunicorns.com/core/operations/release-notes/X-Y/`

## Step 8: Generate GitHub release body

Provide the GitHub release page body:

```markdown
## [X.Y.0](https://github.com/defenseunicorns/uds-core/compare/vPREVIOUS...vX.Y.0) (YYYY-MM-DD)

[Release Notes](https://docs.defenseunicorns.com/core/operations/release-notes/X-Y/)

Please open GitHub issue(s) if you encounter problems using this release.
```

## Step 9: Check docs config

Read `docs/docs.config.json` and check if `archiveCount` needs incrementing (only for minor versions if value < 4). If so, note this for the user.

## Step 10: Sanity check dependency versions

After writing the release notes, run a `git diff` from the previous minor release tag to HEAD across `zarf.yaml` and `values.yaml` files to verify all dependency version numbers in the release notes are exactly correct:

```bash
git diff v<PREVIOUS>...HEAD -- '**/*.yaml' | grep -E '^\+|^\-' | grep -iE '<app-name>' | head -10
```

Cross-reference every entry in the dependency table against the actual image tags and chart versions in the diff. If any version is wrong, fix it before presenting to the user.

## Reminders

- Do NOT commit changes — the user commits manually
- Always review the output with the user before considering it done
- If anything is unclear about a specific change, ask — accuracy matters more than speed
