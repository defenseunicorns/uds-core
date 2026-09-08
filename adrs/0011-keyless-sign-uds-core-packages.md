# 11. Keyless-sign UDS Core packages with tag-based release provenance

Date: 2026-09-08

## Status

Accepted

## Context

UDS Core publishes Zarf packages for the full platform and for functional layers. Consumers need a way to verify that a package came from the UDS Core release process before deploying it, including in the airgap.

Zarf supports Sigstore keyless signing with GitHub Actions OpenID Connect (OIDC). This avoids long-lived signing keys and lets consumers verify packages by checking the signing certificate identity and OIDC issuer. Zarf init packages already use this pattern, with verification tied to the Zarf release workflow at a tag ref.

UDS Core currently creates release tags with `release-please` from a branch-triggered workflow. If UDS Core signs packages in that same branch-triggered workflow, the signing certificate identity is tied to a mutable branch ref such as `refs/heads/main` or `refs/heads/release/1.12`. Formal release packages should instead carry tag-based provenance such as `refs/tags/v1.12.0`.

GitHub Actions does not start most follow-on workflows from events created with `GITHUB_TOKEN`. A tag-push workflow triggered by a `release-please` tag created with `GITHUB_TOKEN` would not run. GitHub explicitly allows `workflow_dispatch` and `repository_dispatch` events created with `GITHUB_TOKEN`, and `workflow_dispatch` supports running a workflow at a branch or tag ref.

## Decision

UDS Core will keyless-sign release and snapshot Zarf packages with Sigstore through GitHub Actions OIDC.

Formal release publishing will use tag-based provenance:

1. `tag-and-release.yaml` remains responsible for running `release-please` on `main` and `release/**` branches.
2. When `release-please` creates a release, `tag-and-release.yaml` dispatches `publish-release.yaml` at the created release tag with `gh workflow run publish-release.yaml --ref <tag>`.
3. `publish-release.yaml` rejects any ref that is not a semver release tag matching `v<major>.<minor>.<patch>`.
4. `publish-release.yaml` allows only one publish workflow for a given release tag to run at a time.
5. `publish-release.yaml` calls the existing reusable `publish.yaml` workflow with `snapshot: false`.
6. `publish-release.yaml` calls the existing reusable `checkpoint.yaml` workflow after package publishing completes to preserve the existing release checkpoint behavior.
7. `tasks/publish.yaml` signs and verifies each standard and functional-layer Zarf package immediately before publishing it. Signing does not use `--overwrite`; a package that already contains a signature fails rather than silently replacing provenance.

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
- Release automation can preserve tag-based provenance without introducing a GitHub App token or personal access token for `release-please`.
- Package publishing fails before release artifacts are published if the signature does not match the expected UDS Core workflow identity.
- Consumers can verify signed packages in the airgap using embedded Sigstore bundle metadata, certificate identity, and OIDC issuer.

### Negative

- `tag-and-release.yaml` now orchestrates a second workflow run through `workflow_dispatch`, which makes release execution less linear than the previous direct reusable workflow call.
- Users with permission to dispatch workflows can re-run release publishing for any existing semver release tag. This supports release recovery, but repository permissions must continue to restrict who can run release workflows. Concurrent release publishes for the same tag are blocked by workflow concurrency.
- Snapshot signatures use mutable `main` branch provenance because snapshots do not have immutable release tags.

## Alternatives considered

1. **Sign formal releases from branch-triggered workflows.** Rejected because branch refs are mutable and weaker than release tag provenance.
2. **Trigger publishing from `push` tag events with a GitHub App token or personal access token.** Rejected for now because it adds credential management across the release process. This remains a viable future option if `workflow_dispatch` proves insufficient.
3. **Add `workflow_dispatch` directly to `publish.yaml`.** Rejected because `publish.yaml` has package write and OIDC permissions. A small guarded wrapper gives a narrower manual dispatch surface and hard-codes `snapshot: false` for formal releases.
4. **Create immutable snapshot tags.** Rejected for now because it adds tag naming, cleanup, retention, and release-management overhead for mutable snapshot artifacts.
