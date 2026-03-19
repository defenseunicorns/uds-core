---
title: Versioning
sidebar:
  order: 2.1
---

This document defines the UDS Core versioning policy, specifically addressing what constitutes our API boundaries and what changes would be considered breaking changes according to [Semantic Versioning](https://semver.org/) principles.

## What constitutes the UDS Core API?

Since UDS Core is a Kubernetes based platform, rather than a traditional application or library, it doesn’t have a traditional API. This document defines the contract with the end user, referred to as the “API” to keep with traditional SemVer wording/principles.

For versioning purposes, the following are considered part of the API:

### 1. Custom Resource Definitions (CRDs)

- Schema definitions, including all fields, their types, and validation rules
- Behavior of the UDS Operator interacting with these resources
- Required configurations and existing behavior of custom resources

### 2. UDS Core configuration and packaging

- UDS Core's own configuration values (config charts)
- Exposed Zarf variables and their expected behavior
- Component organization and included components in published packages

### 3. Default security posture

- Default networking restrictions (network policies)
- Default security integrations (service mesh configuration, runtime security)
- Default mutations and policy validations

Anything not listed here is generally not considered to be part of the public API, for example: internal implementation details, non-configurable Helm templates, test/debug utilities, and any component not exposed to the user or external automation.

## Breaking vs. non-breaking changes

Any references to “public API” or “API” in the below sections assume the above definition of UDS Core’s API / Contract with the end user.

### Breaking changes (require major version bump)

The following changes would be considered breaking changes and would require a major version bump:

- **Removal or renaming** of any field, parameter, or interface in the public API
- **Changes to behavior** of existing APIs that could cause deployments of UDS Core to function incorrectly
- **Schema changes** that make existing valid configurations invalid
- **Changing default values** in ways that alter existing behavior without explicit configuration
- **Removal of supported capabilities** previously available to users
- **Significant changes to security posture** that would require users to reconfigure their mission applications

### Examples of breaking changes:

1. Changing the default service mesh integration method (i.e. from sidecar to ambient mode)
2. Adding new, more restrictive default network policies that would block previously allowed traffic
3. Removing a field from the Package CRD (i.e. removing `monitor[].path`)
4. Removing/replacing a component (i.e. the tooling used for monitoring) from the published UDS Core package

### Security exception

As a security-first platform, UDS Core reserves the right to release security-related breaking changes in minor versions when the security benefit to users outweighs the disruption of waiting for a major release. These changes will still be clearly advertised as breaking changes in the changelog and release notes.

The team will always strive to minimize the impact on users and will only exercise this exception when the security improvement is necessary and urgent. Examples of when this exception may be applied include:

- Removing or changing default behaviors that pose a security risk
- Enforcing stricter security policies to address discovered vulnerabilities
- Updating security integrations that require configuration changes

Users should review release notes carefully for any security-related breaking changes, even in minor releases.

### Non-breaking changes (compatible with minor or patch version bumps)

The following changes are compatible with a minor version bump (new features) or patch version bump (bug fixes):

- **Adding new optional fields** to CRDs or configuration
- **Creation of a new CRD version** *without* removing the older one
- **Extending functionality** without changing existing behavior
- **Bug fixes** that restore intended behavior
- **Performance improvements** that don't alter behavior
- **Security enhancements** that don't require user reconfiguration
- **New features** that are opt-in and don't change existing defaults
- **Upstream major helm chart/application changes** that don't affect UDS Core's API contract

### Examples of non-breaking changes:

1. Adding a new optional field to a CRD
2. Creating a new "v1" Package CRD without removing/changing the "v1beta1" Package CRD
3. Enhancing monitoring capabilities with new metrics
4. Adding new Istio configuration options that are off by default
5. Adding a new default NetworkPolicy to expand allowed communications
6. Upgrading an underlying application component's version without changing UDS Core's API contract
