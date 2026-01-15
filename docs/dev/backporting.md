# Backporting Patch Fixes to release/X.Y

This guide explains how to backport bug/security fixes from `main` to supported minor release branches (`release/X.Y`).

## Overview

- Minor/Major releases are cut from `main` (release-please with `always-bump-minor`).
- Patch releases are cut from `release/X.Y` branches.
- We support three concurrent streams: `n`, `n-1`, `n-2`.
- Backport PRs into `release/*` run light CI (lint + unit + shimmed required checks).
- Release PRs created by release-please on `release/*` run full CI.

## Automated Backport (Recommended)

The easiest way to backport is using the helper task in `tasks/backport.yaml`. This script automates the manual steps of branching, cherry-picking, and PR creation.

### 1. Prerequisites
- `gh` CLI installed and authenticated (for automatic PR creation).
- A clean working tree.
- The commit SHA from `main` that you want to backport. You can find it on [GitHub Commits](https://github.com/defenseunicorns/uds-core/commits/main/).
  - The fix to backport must have already been PR-ed to `main` and merged
  - *Note: Both full and short SHAs are supported.*

### 2. Run the Task
The task requires `target_versions` (minor versions like `0.54`) and the `commit` SHA.

```console
uds run -f tasks/backport.yaml backport \
  --with target_versions="0.54,0.55,0.56" \
  --with commit=b4068116c
```

> [!NOTE]
> `target_versions` should be plain `X.Y` values (no `v` or `release/` prefix) and match the `MAJOR.MINOR` version you want to backport to.
> Multiple versions must be comma-separated (e.g. `0.54,0.55` or `"0.54, 0.55, 0.56"`).

### 3. Handle Conflicts
The task is designed to fail if there are conflicts when cherry-picking commits to the release branches. If this happens you will need to resolve conflicts and follow the instructions that are outputted to complete the backport, then re-run the task for any subsequent releases if applicable.

## Post-Backport Workflow

Once the backport script finishes successfully, it creates a Pull Request for each target version.

1. **Review & Approve**: Go to GitHub and find the new `backport/...` PRs. Ensure CI passes and get approvals.
2. **Merge**: Merge the backport PR into the `release/X.Y` branch.
3. **Release PR**: Once merged, `release-please` will automatically create a new Release PR (e.g., `vX.Y.Z`).
4. **Trigger Release**: Approve the Release PR and add the `milestone` (if required) to trigger the full CI and release pipeline.
5. **Monitor**: Watch the progress on the [GitHub Actions page](https://github.com/defenseunicorns/uds-core/actions).
6. **Announce**: Once the release is published:
   - Update the Slack channel.
   - Update the GitHub Release description if necessary (patch notes usually only need a brief summary of what was fixed).

## Manual Backport (Alternative)
### Branch and PR flow

1. Land the fix on `main` via the normal PR process.
2. Create a backport branch from `release/X.Y`, cherry-pick the commit, and push.
3. Open a PR from the backport branch to `release/X.Y`.
4. After merge to `release/X.Y`, a patch Release PR will be opened by release-please;
   merge it to create `vX.Y.Z` and publish.

### Backport branch naming

- Convention: `backport/<name>-to-<X.Y>` (lowercase, spaces replaced with `-`).
- The CI does not enforce this, but it’s recommended for clarity and discoverability.
