---
title: Release Overview
tableOfContents:
  maxHeadingLevel: 3
---

This document outlines how UDS Core is versioned, released, tested, and maintained.

## Release Cadence

UDS Core follows a predictable release schedule to provide regular updates and improvements:

- **Regular Releases**: New versions are published every 2 weeks (typically on Tuesdays)
- **Hotfix Releases**: Critical bug fixes may be released outside the regular cycle when necessary

### Hotfix Policy

Hotfix releases are created for critical issues that cannot wait for the next regular release cycle. We typically cut hotfix releases for:

- Bugs preventing installation or upgrade (even if only affecting specific configurations)
- Issues limiting access to core services (UIs/APIs) or ability to configure/communicate with external dependencies
- Significant regressions in functionality or behavior
- Security vulnerabilities requiring immediate attention

We reserve the right to cut releases outside the normal schedule whenever we deem necessary to address important issues.

## Versioning Strategy

UDS Core follows [Semantic Versioning 2.0.0](https://semver.org/).

For a more detailed review of how UDS Core applies Semantic Versioning, see the [versioning](https://github.com/defenseunicorns/uds-core/blob/main/VERSIONING.md) document in our repository.

### Breaking Changes

Breaking changes are clearly documented in the [CHANGELOG.md](https://github.com/defenseunicorns/uds-core/blob/main/CHANGELOG.md) with the `⚠ BREAKING CHANGES` header (and in the [GitHub release notes](https://github.com/defenseunicorns/uds-core/releases)). Each breaking change includes specific upgrade steps required when applicable.

### Current Stability Status

While UDS Core has not yet reached version 1.0, it is considered production-ready and stable. The pre-1.0 versioning reflects our commitment to maintaining flexibility as we continue to enhance our security posture.

## Release Process

### Official Releases

The release process is automated using [release-please](https://github.com/googleapis/release-please) and GitHub workflows:

1. Changes are merged to the `main` branch through pull requests
2. Release-please automatically determines the next version based on conventional commits
3. A release PR is created with updated version numbers and CHANGELOG entries
4. Once merged, a new version tag is created and the release workflow is triggered
5. Release artifacts are built, tested, and published
6. CVE scans are performed on the released artifacts
7. Release notes are automatically generated from the CHANGELOG

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
- Packages are versioned both with `latest` tags (mutable tag, will always have the latest snapshot), and with a date string + commit hash (for a specific pinned snapshot)
- Useful for testing new features before official releases
- **Not recommended for production use**

### Feature Previews

For significant new features or architectural changes, special snapshot builds may be created:

- Available from feature branches or `main`
- Provided for early feedback and validation

## Upgrade Recommendations

When upgrading UDS Core:

1. Always review the [CHANGELOG](https://github.com/defenseunicorns/uds-core/blob/main/CHANGELOG.md) for breaking changes and new features
2. Test upgrades in a staging environment before upgrading production
3. Follow the detailed [upgrade documentation](/reference/deployment/upgrades)
4. Consider the impact on any mission applications running on UDS Core

For mission-critical deployments, we recommend maintaining a staging environment that mirrors production for validating upgrades before deployment.
