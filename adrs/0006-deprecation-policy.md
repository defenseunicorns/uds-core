# 6. Deprcation Policy

Date: 2026-01-13

## Status

Accepted

## Context

UDS Core follows Semantic Versioning and provides regular minor releases on a two-week cadence, with patch support for the latest three minor versions. The platform exposes a broad, Kubernetes-native API surface (CRDs, configuration, defaults, and packaging) that is consumed by long-lived clusters and mission applications.

Strict adherence to SemVer—requiring a major release for all breaking changes—would significantly slow iteration and create pressure to batch unrelated changes into infrequent major releases. This model does not align well with Kubernetes ecosystem norms, where breaking removals commonly occur in minor releases after a well-defined deprecation period.

At the same time, removing deprecated functionality without clear guarantees would erode user trust and complicate upgrade planning. A clear, predictable deprecation policy is required to balance platform evolution, security posture improvements, and operator stability.

## Decision

UDS Core will adopt a **time-based deprecation model aligned with minor releases**, rather than requiring a major release for all breaking removals.

The policy is defined as follows:

- Deprecated features will remain supported for **at least three minor releases** following their deprecation announcement.
- Deprecated features **may be removed** in:
  - The next minor release after the three-minor deprecation window has elapsed, **or**
  - Any new major release.
- Removal of deprecated functionality is considered a **breaking change**, even when it occurs in a minor release.
- Breaking changes **must not** occur in minor releases unless they are the explicit removal of previously deprecated functionality.
- Patch releases will never introduce deprecations or remove deprecated functionality.

**Example:** If a feature is deprecated in version `0.30.0`, it must remain supported through versions `0.31.0`, `0.32.0`, and `0.33.0`. It becomes eligible for removal starting in `0.34.0` or any subsequent release (including a hypothetical `1.0.0`).

This approach aligns deprecation timelines with UDS Core’s existing backport and support policy, providing users with clear expectations and sufficient time to migrate.

## Consequences

### Positive

- Predictable Upgrades: Users can rely on a fixed, well-documented deprecation window tied to minor releases.
- Faster Evolution: Enables timely cleanup of deprecated APIs without waiting for infrequent major releases.
- Ecosystem Alignment: Matches common practices in Kubernetes and CNCF-adjacent projects.
- Security Agility: Allows removal of deprecated or risky functionality without long-term stagnation.
- Policy Consistency: Aligns deprecation guarantees with the existing three-minor support model.

### Negative

- SemVer Strictness: This approach deviates from strict SemVer expectations where all breaking changes require a major version bump.
- Operator Awareness Required: Users must actively track deprecations in changelogs and release notes to avoid surprise breakage.
- Increased Documentation Burden: Deprecations and removals must be clearly and consistently communicated to maintain trust.

## Alternatives Considered

### Require Major Releases for All Breaking Changes

Rejected. This would force either very frequent major releases or long-lived deprecated functionality, neither of which aligns with UDS Core’s release cadence, security posture, or Kubernetes platform norms.

### Indefinite Deprecation Until Major Release Is “Warranted”

Rejected. This introduces ambiguity and inconsistency, making it difficult for users to predict when deprecated features will be removed and increasing long-term maintenance burden.

### Immediate Removal in Minor Releases Without Deprecation

Rejected. This would introduce unexpected breaking changes and significantly undermine upgrade safety and user confidence.

## Notes

This ADR defines **policy**, not implementation details. All deprecations and removals will continue to be clearly documented in `CHANGELOG.md`, GitHub release notes, and relevant upgrade documentation.
