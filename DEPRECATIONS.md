# UDS Core Deprecations

This document tracks all currently deprecated features in UDS Core. Deprecated features remain functional but are scheduled for removal in a future major release.

## Active Deprecations

<!--
When adding a deprecation, include:
- Feature: What is being deprecated
- PR: Link to the pull request that introduced the deprecation
- Deprecated In: The version where deprecation was announced
- Reason: Why it is being deprecated
- Migration: The recommended replacement or migration path
- Removal Target: The projected major version for removal
-->

| Feature | PR | Deprecated In | Reason | Migration | Removal Target |
|---------|-----|---------------|--------|-----------|----------------|
| `sso.secretName`, `sso.secretLabels`, `sso.secretAnnotations`, `sso.secretTemplate` | [#2264](https://github.com/defenseunicorns/uds-core/pull/2264) | 0.60.0 | Simplify fields and make more coherent | Use `sso.secretConfig.name`, `.labels`, `.annotations`, `.template` instead | 1.0.0 |

## Recently Removed

This section lists features that were removed in recent major releases for historical reference.

| Feature | Deprecated In | Removed In | Migration |
|---------|---------------|------------|-----------|
| _None_ | - | - | - |
