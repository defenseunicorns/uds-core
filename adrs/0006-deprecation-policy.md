# 6. Deprecation Policy

Date: 2026-01-13

## Status

Accepted

## Context

UDS Core follows Semantic Versioning and provides regular minor releases on a two-week cadence, with patch support for the latest three minor versions. The platform exposes a broad, Kubernetes-native API surface (CRDs, configuration, defaults, and packaging) that is consumed by long-lived clusters and mission applications.

Users of UDS Core expect predictable upgrade paths and clear boundaries for breaking changes. Removing deprecated functionality without clear guarantees would erode user trust and complicate upgrade planning. Strict adherence to Semantic Versioning—requiring a major release for all breaking changes—provides users with confidence that minor version upgrades will not break their deployments.

A clear, predictable deprecation policy is required to balance platform evolution with user stability, ensuring adequate migration time while maintaining the flexibility to evolve the platform.

## Decision

UDS Core will adopt a **deprecation model that requires major releases for all deprecation removals**, aligning with strict Semantic Versioning principles while ensuring users have adequate time to migrate.

The policy is defined as follows:

- Deprecated features will remain supported for **at least three subsequent minor releases** following their deprecation announcement.
- Deprecated features **may only be removed** in major releases, and only after the three-minor-release window has elapsed.
- Removal of deprecated functionality is considered a **breaking change** and will only occur in major releases.
- Patch releases will never introduce deprecations or remove deprecated functionality.
- **Users are expected to resolve all deprecation warnings before upgrading to the next major version** to avoid encountering breaking changes.

**Example:** If a feature is deprecated in version `0.30.0`, it must remain supported through at least the three subsequent minor releases: `0.31.0`, `0.32.0`, and `0.33.0`. It becomes eligible for removal starting in `1.0.0` (assuming `1.0.0` is released after `0.33.0`). If a major release were planned before the three-minor window elapsed, the deprecated feature would remain and could not be removed until the following major release.

This approach provides users with clear, predictable upgrade paths, ensures adequate migration time, and aligns with strict Semantic Versioning expectations.

## Implementation

This section defines how deprecations are tracked and communicated.

### Commit Convention

Deprecations are introduced using the conventional commit format with a `(deprecation)` scope:

```
feat(deprecation): deprecate monitor[].path field in Package CRD
```

This ensures deprecations are visible in the commit history and automatically included in GitHub release notes.

### GitHub Releases

Deprecations will be advertised in GitHub release notes. The release automation will pick up `feat(deprecation)` commits and include them in the release notes.

### DEPRECATIONS.md

A `DEPRECATIONS.md` file in the repository root tracks all active deprecations. When introducing a deprecation, developers must:

1. Add an entry to `DEPRECATIONS.md` with:
   - The deprecated feature or API
   - A link to the pull request introducing the deprecation
   - The version in which it was deprecated
   - The reason for deprecation
   - The recommended migration path or replacement
   - The projected major version in which it will be removed

2. When a deprecated feature is removed in a major release, remove its entry from `DEPRECATIONS.md`.

**Developer Checklist for Deprecations:**

1. Create a commit using `feat(deprecation): <description>`
2. Update `DEPRECATIONS.md` with the new deprecation entry
3. Add any necessary migration guidance to documentation
4. Ensure the deprecation is mentioned in the PR description

## Consequences

### Positive

- Predictable Upgrades: Users can rely on major version boundaries for all breaking changes from deprecation removals.
- SemVer Compliance: Aligns with strict Semantic Versioning expectations where breaking changes require a major version bump.
- Adequate Migration Time: The three-minor-release minimum ensures users have sufficient time to migrate before removal.
- Clear Tracking: The `DEPRECATIONS.md` file provides a single source of truth for all active deprecations.
- Transparent Communication: Commit conventions and GitHub releases make deprecations visible and trackable.

### Negative

- Slower Evolution: Deprecated functionality may persist longer, as removal requires waiting for a major release.
- Major Release Pressure: May create pressure to batch multiple deprecation removals into major releases.
- Manual Maintenance: Developers must manually update `DEPRECATIONS.md` when introducing or removing deprecations.

## Alternatives Considered

### Allow Deprecation Removals in Minor Releases

Rejected. While this would enable faster cleanup of deprecated APIs, it deviates from strict Semantic Versioning and could surprise users who expect breaking changes only in major releases. The predictability of major-version-only removals outweighs the benefit of faster deprecation cycles.

### Indefinite Deprecation Until Major Release Is "Warranted"

Rejected. This introduces ambiguity and inconsistency, making it difficult for users to predict when deprecated features will be removed and increasing long-term maintenance burden. The three-minor-release minimum provides a clear, predictable timeline.

### Immediate Removal in Minor Releases Without Deprecation

Rejected. This would introduce unexpected breaking changes and significantly undermine upgrade safety and user confidence.

### Track Deprecations Only in Changelog

Rejected. While changelogs capture deprecations, a dedicated `DEPRECATIONS.md` file provides a single, easy-to-reference source of truth for all active deprecations, their migration paths, and projected removal versions.

## Notes

This ADR defines both **policy and implementation**. Deprecations are tracked in `DEPRECATIONS.md`, communicated via `feat(deprecation)` commits in GitHub release notes, and removals are documented in `CHANGELOG.md` as breaking changes in major releases.
