# 11. Keyless-sign UDS Core packages with tag-based release provenance

Date: 2026-09-08

## Status

Accepted

## Context

UDS Core publishes Zarf packages for standard package and for functional layers. Consumers need a way to verify that a package came from the UDS Core release process before deploying it, including in the airgap.

Zarf supports native keyless package signing and verification commands backed by GitHub Actions OpenID Connect (OIDC). This avoids long-lived signing keys and lets consumers verify packages by checking the signing certificate identity and OIDC issuer. Zarf init packages already use this pattern. Zarf publishes from a tag-triggered release workflow and signs init packages from that tag ref, so consumers can verify immutable release provenance.

UDS Core currently creates release tags with `release-please` from a branch-triggered workflow. If UDS Core signs packages in that same branch-triggered workflow, the signing certificate identity is tied to a mutable branch ref such as `refs/heads/main` or `refs/heads/release/1.12`. Formal release packages should instead carry tag-based provenance such as `refs/tags/v1.12.0`.

GitHub Actions does not start most follow-on workflows from events created with `GITHUB_TOKEN`. A tag-push workflow triggered by a `release-please` tag created with `GITHUB_TOKEN` would not run. Zarf avoids this by using a GitHub App token for the release/tag phase of its `release-please` workflow, which lets the release tag push trigger the tag-based publishing workflow. UDS Core will use the same pattern, while keeping release PR creation on `GITHUB_TOKEN` so release PR validation continues to use the existing milestone/manual trigger process. GitHub repository rulesets can restrict release tag creation, but the built-in `GITHUB_TOKEN` is not an appropriate bypass identity for protected semver release tags. A GitHub App gives release automation an explicit identity that can be granted tag ruleset bypass permissions.

## Decision

UDS Core will use Zarf's native keyless signing and verification capabilities for release and snapshot Zarf packages.

Formal release publishing will use tag-based provenance and align with the Zarf release model:

1. `release-please.yaml` runs `release-please` on `main` and `release/**` branches in two phases: a release/tag phase that uses a token from the `uds-release-please` GitHub App, and a release PR phase that uses `GITHUB_TOKEN`.
2. The `uds-release-please` GitHub App must be installed on this repository with enough permissions to create release tags and GitHub releases. Repository rulesets must protect semver release tags matching `v<major>.<minor>.<patch>` and allow this GitHub App to create those tags.
3. A semver release tag push from the GitHub App triggers `release.yaml`, which calls the reusable `publish.yaml` workflow with `snapshot: false`. The workflow uses per-tag concurrency so only one publish run can proceed for a release tag.
4. `tasks/publish.yaml` signs and verifies each standard and functional-layer Zarf package immediately before publishing it. Signing does not use `--overwrite`; a package that already contains a signature fails rather than silently replacing provenance.

Release package verification will use this certificate identity regex:

```text
^https://github\.com/defenseunicorns/uds-core/\.github/workflows/publish\.yaml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$
```

Snapshot publishing will continue to run from the scheduled snapshot workflow on `main`. Snapshot packages will be signed and verified with this certificate identity regex:

```text
^https://github\.com/defenseunicorns/uds-core/\.github/workflows/publish\.yaml@refs/heads/main$
```

Both release and snapshot verification will require the GitHub Actions OIDC issuer:

```text
https://token.actions.githubusercontent.com
```

UDS Core will not introduce a long-lived package signing key or publish a UDS Core public key. UDS Core will not sign UDS bundle artifacts as part of this decision. Bundle manifests that reference published UDS Core packages should include Zarf `keylessVerification` metadata for those package entries.

## Consequences

### Positive

- Formal release packages have tag-based provenance that matches the Zarf init package signing model.
- UDS Core avoids long-lived signing keys, public key distribution, key rotation, and key custody processes.
- Release automation uses a dedicated GitHub App identity instead of a personal access token.
- Protected semver release tags make the documented verification regex meaningful: only authorized release automation can create tags that match the trusted signing identity.
- Package publishing fails before release artifacts are published if the signature does not match the expected UDS Core workflow identity.
- Consumers can verify signed packages in the airgap using the package's embedded keyless signature metadata, certificate identity, and OIDC issuer.

### Negative

- UDS Core must install and maintain the `uds-release-please` GitHub App and its private key secret.
- Repository rulesets must be configured outside this repository to protect semver release tags and grant the GitHub App bypass permissions.
- Snapshot signatures use mutable `main` branch provenance because snapshots do not have immutable release tags.

## Alternatives considered

1. **Sign formal releases from branch-triggered workflows.** Rejected because branch refs are mutable and weaker than release tag provenance.
2. **Dispatch a tag-ref publish workflow with `GITHUB_TOKEN`.** Rejected because it avoids an extra credential but does not establish that the semver tag was created by trusted release automation.
3. **Use a personal access token for release automation.** Rejected because a GitHub App provides a clearer automation identity, scoped permissions, and better ownership than a user-owned token.
4. **Add `workflow_dispatch` directly to `publish.yaml`.** Rejected because `publish.yaml` has package write and OIDC permissions. A tag-triggered wrapper gives a narrower release surface and hard-codes `snapshot: false` for formal releases.
5. **Create immutable snapshot tags.** Rejected for now because it adds tag naming, cleanup, retention, and release-management overhead for mutable snapshot artifacts.
6. **Sign UDS bundle artifacts.** Deferred because CORE-41 covers Zarf package signing. Bundle signing requires separate UDS CLI workflow and verification decisions.
