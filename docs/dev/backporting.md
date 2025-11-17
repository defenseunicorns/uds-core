# Backporting Patch Fixes to release/X.Y

This guide explains how to backport bug/security fixes from `main` to supported minor release branches (`release/X.Y`).

## Overview

- Minor/Major releases are cut from `main` (release-please with `always-bump-minor`).
- Patch releases are cut from `release/X.Y` branches.
- We support three concurrent streams: `n`, `n-1`, `n-2`.
- Backport PRs into `release/*` run light CI (lint + unit + shimmed required checks).
- Release PRs created by release-please on `release/*` run full CI.

## Branch and PR flow

1. Land the fix on `main` via the normal PR process.
2. Create a backport branch from `release/X.Y`, cherry-pick the commit, and push.
3. Open a PR from the backport branch to `release/X.Y`.
4. After merge to `release/X.Y`, a patch Release PR will be opened by release-please;
   merge it to create `vX.Y.Z` and publish.

## Backport branch naming

- Convention: `backport/<name>-to-<X.Y>` (lowercase, spaces replaced with `-`).
- The CI does not enforce this, but it’s recommended for clarity and discoverability.

## Helper task

Use the helper task (in `tasks/backport.yaml`) to create backport branches, cherry-pick a single commit, and open PRs. This does require `gh` CLI for automatic PR creation.

The helper task requires inputs for the specific "target versions" (minor version to backport to) as well as the specific commit SHA you want to backport. For example:

```console
uds run -f tasks/backport.yaml backport \
  --with target_versions=0.54,0.55,0.56 \
  --with commit=b4068116c
```

The task is designed to fail if there are conflicts when cherry-picking commits to the release branches. If this happens you will need to resolve conflicts and follow the instructions that are outputted to complete the backport, then re-run the task for any subsequent releases if applicable.

> [!NOTE]
> `target_versions` should be plain `X.Y` values (no `v` or `release/` prefix) and match the `MAJOR.MINOR` version you want to backport to.
> Multiple versions must be comma-separated with no spaces (e.g. `0.54,0.55`).
