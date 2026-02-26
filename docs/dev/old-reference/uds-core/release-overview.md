---
title: Release Overview
tableOfContents:
  maxHeadingLevel: 4
---

This document outlines how UDS Core is versioned, released, tested, and maintained.

<!-- @lulaStart 88df25e3-2abd-43f4-990b-8f0da08ee643 -->
## Release Cadence

UDS Core follows a predictable release schedule to provide regular updates and improvements:

- **Regular Releases** (minor or major): New versions are published every 2 weeks (typically on Tuesdays)
- **Patch Releases**: Critical bug fixes are released as patches outside the regular cycle when necessary

### Patch Policy

Patch releases are created for critical issues that cannot wait for the next regular release cycle. We typically cut patch releases for:

- Bugs preventing installation or upgrade (even if only affecting specific configurations)
- Issues limiting access to core services (UIs/APIs) or ability to configure/communicate with external dependencies
- Significant regressions in functionality or behavior
- Security vulnerabilities requiring immediate attention

We reserve the right to cut releases outside the normal schedule whenever we deem necessary to address important issues.

<!-- @lulaEnd 88df25e3-2abd-43f4-990b-8f0da08ee643 -->

## Versioning Strategy

UDS Core follows [Semantic Versioning 2.0.0](https://semver.org/).

For a more detailed review of how UDS Core applies Semantic Versioning, see the [versioning](https://github.com/defenseunicorns/uds-core/blob/main/VERSIONING.md) document in our repository.

### Breaking Changes

Breaking changes are clearly documented in the [CHANGELOG.md](https://github.com/defenseunicorns/uds-core/blob/main/CHANGELOG.md) with the `⚠ BREAKING CHANGES` header (and in the [GitHub release notes](https://github.com/defenseunicorns/uds-core/releases)). Each breaking change includes specific upgrade steps required when applicable.

#### Security Exception

As a security-first platform, UDS Core reserves the right to release security-related breaking changes in minor versions when the security benefit to users outweighs the disruption of waiting for a major release. These changes will still be clearly advertised as breaking changes. We will always strive to minimize the impact on users and will only exercise this exception when the security improvement is necessary and urgent.

### Current Stability Status

While UDS Core has not yet reached version 1.0, it is considered production-ready and stable. The pre-1.0 versioning reflects our commitment to maintaining flexibility as we continue to enhance our security posture.

### Version Support

UDS Core provides patch support for the latest three minor versions (the current minor and the two previous minors), where applicable. Minor and major releases are cut from `main`, while patch releases are published from dedicated `release/X.Y` branches for each supported minor stream. Patch releases follow the [patch policy](#patch-policy) and are not present in the main repository changelog (but are documented in GitHub releases).

### Deprecation Policy

UDS Core uses a deprecation process to evolve the platform safely while providing clear, predictable upgrade paths for users. Deprecations signal upcoming breaking changes and allow sufficient time for migration before removal in a major release.

#### Scope

This policy applies to all elements of the UDS Core public API, as defined in the [Versioning](https://github.com/defenseunicorns/uds-core/blob/main/VERSIONING.md) document, including:

- Custom Resource Definitions (CRDs), CRD versions, fields, and behaviors
- UDS Core configuration values and defaults
- Exposed Zarf variables
- Default-enabled components or integrations
- Default behaviors that are planned to change or be removed

Internal implementation details are not subject to this policy.

#### How Deprecations Are Announced

Deprecations are introduced via commits using the `feat(deprecation)` conventional commit format and are included in GitHub release notes. Each deprecation includes:

- What is being deprecated
- Why it is being deprecated
- The recommended replacement or migration path
- The projected major version in which it will be removed

All active deprecations are tracked in the [DEPRECATIONS.md](https://github.com/defenseunicorns/uds-core/blob/main/DEPRECATIONS.md) file, which serves as a single source of truth for deprecated features, their deprecation version, and projected removal version.

#### Support Period

Deprecated features remain supported for **at least three subsequent minor releases** following their deprecation announcement and **may only be removed in a major release**. They continue to function without behavioral changes during this period and may receive bug fixes and security fixes when feasible.

For example, if a feature is deprecated in version `0.30.0`, it must remain supported through at least the three subsequent minor releases: `0.31.0`, `0.32.0`, and `0.33.0`. It becomes eligible for removal starting in `1.0.0` (assuming `1.0.0` is released after `0.33.0`). If a major release were planned before the three-minor window elapsed, the deprecated feature would remain and could not be removed until the following major release.

Removal of deprecated functionality is considered a breaking change and will only occur in major releases. Patch releases never introduce deprecations or remove deprecated functionality.

:::caution
Users are expected to resolve all deprecation warnings before upgrading to the next major version to avoid encountering breaking changes.
:::

#### CRD-Specific Guarantees

Because CRDs represent a primary API boundary for UDS Core, they receive the same deprecation guarantees:

- Deprecated CRD fields and versions remain accepted for at least three minor releases after deprecation
- New CRD versions may be introduced without removing older versions
- CRD version or field removal follows the standard deprecation lifecycle and only occurs in major releases

## Release Process

### Official Releases

The release process is automated using [release-please](https://github.com/googleapis/release-please) and GitHub workflows:

1. Changes are merged to the `main` branch through pull requests
1. Release-please automatically determines the next version based on conventional commits
1. A release PR is created with updated version numbers and CHANGELOG entries
1. Once merged, a new version tag is created and the release workflow is triggered
1. Release artifacts are built, tested, and published
1. CVE scans are performed on the released artifacts
1. Release notes are automatically generated from the CHANGELOG

### Release Artifacts

Each release includes:

- Zarf packages for all UDS Core components
- Pre-configured UDS bundles for demos and development (with [`uds-k3d`](https://github.com/defenseunicorns/uds-k3d))
- Documentation updates as necessary

## Testing Strategy

UDS Core undergoes rigorous testing before each release.

### Functionality Testing

- **Operator Logic Tests**: Validate UDS Operator functionality and reconciliation logic
- **UI Journey Tests**: End-to-end testing of user workflows across application interfaces
- **API Validation Tests**: Verify API endpoints and responses function correctly
- **Cross-Distribution Tests**: Validate compatibility with [supported Kubernetes distributions](/reference/uds-core/distribution-support)
- **Upgrade Tests**: Verify smooth upgrades from previous versions

### Security Testing

- **Static Analysis**: CodeQL scans for code vulnerabilities
- **Dependency Scanning**: Checks for vulnerabilities in dependencies
- **Container Scanning**: Analyzes container images for security issues
- **Policy Compliance**: Validates adherence to security policies

### Production Validation

Defense Unicorns maintains several environments running UDS Core that are updated shortly after each release, providing additional real-world validation.

## Development Builds

### Nightly Snapshots

Automated builds from the latest `main` branch are created daily at 10:00 UTC:

- Tagged as `snapshot-latest` on GitHub
- Available as Zarf packages and UDS bundles in the [GitHub Packages repository](https://github.com/orgs/defenseunicorns/packages?tab=packages&q=uds%2Fsnapshots+repo%3Adefenseunicorns%2Fuds-core)
- Each snapshot is tagged with a unique identifier combining date string + commit hash (for immutable, pinned references), while the most recent snapshots are also tagged with `latest` (a mutable tag that always points to the newest snapshot)
- Useful for testing new features before official releases
- **Not recommended for production use**

### Feature Previews

For significant new features or architectural changes, special snapshot builds may be created:

- Available from feature branches or `main`
- Provided for early feedback and validation

## Upgrade Recommendations

When upgrading UDS Core:

1. Always review the [CHANGELOG](https://github.com/defenseunicorns/uds-core/blob/main/CHANGELOG.md) for breaking changes and new features. 
1. Ensure you have reviewed and performed any [Keycloak / Identity Config upgrade steps](/reference/uds-core/idam/upgrading-versions).
1. Test upgrades in a staging environment before upgrading production
1. Follow the detailed [upgrade documentation](/reference/deployment/upgrades)
1. Consider the impact on any mission applications running on UDS Core

For mission-critical deployments, we recommend maintaining a staging environment that mirrors production for validating upgrades before deployment.
