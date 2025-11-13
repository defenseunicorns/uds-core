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
2. Create a backport branch from `release/X.Y`, cherry-pick the commits, and push.
3. Open a PR from the backport branch to `release/X.Y`.
4. After merge to `release/X.Y`, a patch Release PR will be opened by release-please;
   merge it to create `vX.Y.Z` and publish.

## Backport branch naming

- Convention: `backport/<name>-to-<X.Y>` (lowercase, spaces replaced with `-`).
- The CI does not enforce this, but it’s recommended for clarity and discoverability.

## Helper task

Use the helper to create a backport branch and cherry-pick commits in order.

Examples:

- With a descriptive name and specific commit SHAs:

```sh
uds run backport:backport \
  --with target_versions=0.54,0.55 \
  --with commits=abcd1234,ef567890 \
  --with name="keycloak-fix"
```

- Without a name (defaults to the first SHA or PR-derived SHA):

```sh
uds run backport:backport \
  --with target_versions=0.54,0.55 \
  --with commits=abcd1234,ef567890
```
