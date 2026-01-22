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
| `allow.podLabels`, `allow.remotePodLabels`, `expose.podLabels`, `expose.match` | [#154](https://github.com/defenseunicorns/uds-core/pull/154) | 0.12.0 | Improve API naming and organization | Use `allow.selector`, `allow.remoteSelector`, `expose.selector`, `expose.advancedHTTP.match` instead | 1.0.0 |
| Keycloak `fips` helm value | [#1518](https://github.com/defenseunicorns/uds-core/pull/1518) | 0.43.0 | FIPS mode is now enabled by default for all deployments | If you override `fips` to `false`, remove that override as soon as possible to enable FIPS mode before it becomes the only allowed method | 1.0.0 |
| Keycloak `x509LookupProvider`, `mtlsClientCert` helm values | [#1670](https://github.com/defenseunicorns/uds-core/pull/1670) | 0.47.0 | Values will be hardcoded; EnvoyFilter manages headers for third-party integrations | No action needed; remove any overrides of these values | 1.0.0 |
| `operator.KUBEAPI_CIDR`, `operator.KUBENODE_CIDRS` | [#1233](https://github.com/defenseunicorns/uds-core/pull/1233) | 0.48.0 | Moved to ClusterConfig CRD for centralized configuration | Use `cluster.networking.kubeApiCIDR` and `cluster.networking.kubeNodeCIDRs` instead | 1.0.0 |
| `CA_CERT` Zarf variable | [#2167](https://github.com/defenseunicorns/uds-core/pull/2167) | 0.58.0 | Improved naming clarity for centralized trust bundle management | Use `CA_BUNDLE_CERTS` instead | 1.0.0 |
| `sso.secretName`, `sso.secretLabels`, `sso.secretAnnotations`, `sso.secretTemplate` | [#2264](https://github.com/defenseunicorns/uds-core/pull/2264) | 0.60.0 | Simplify fields and make more coherent | Use `sso.secretConfig.name`, `.labels`, `.annotations`, `.template` instead | 1.0.0 |

## Recently Removed

This section lists features that were removed in recent major releases for historical reference.

| Feature | Deprecated In | Removed In | Migration |
|---------|---------------|------------|-----------|
| _None_ | - | - | - |
