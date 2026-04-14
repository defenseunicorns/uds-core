---
title: Deprecations
description: Complete reference for UDS Core deprecations, listing currently deprecated features and their scheduled removal versions.
sidebar:
  order: 2.2
---

This document tracks all currently deprecated features in UDS Core. Deprecated features remain functional but are scheduled for removal in a future major release.

## Active deprecations

<!--
When adding a deprecation, include:
- Feature: What is being deprecated
- Deprecated In: The version where deprecation was announced (link to the PR)
- Details: Why it is being deprecated (Reason) and the recommended migration path (Migration)
- Removal Target: The projected major version for removal
-->

| Feature                                                                             | Deprecated In                                                           | Details                                                                                                                                                  | Removal Target    |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `allow.podLabels`, `allow.remotePodLabels`, `expose.podLabels`, `expose.match`      | 0.12.0 ([#154](https://github.com/defenseunicorns/uds-core/pull/154))   | **Reason:** API naming improved.<br/>**Migration:** Use `allow.selector`, `allow.remoteSelector`, `expose.selector`, `expose.advancedHTTP.match` instead | Package `v1beta1` |
| `sso.secretName`, `sso.secretLabels`, `sso.secretAnnotations`, `sso.secretTemplate` | 0.60.0 ([#2264](https://github.com/defenseunicorns/uds-core/pull/2264)) | **Reason:** Simplified field structure.<br/>**Migration:** Use `sso.secretConfig.name`, `.labels`, `.annotations`, `.template` instead                   | Package `v1beta1` |
<!-- | `CLIENT_SECRET` authentication mode for the `uds-operator` Keycloak client (configured via `KEYCLOAK_CLIENT_MODE`) | 1.2.0 ([#2580](https://github.com/defenseunicorns/uds-core/pull/2580)) | **Reason:** Federated Signed JWTs replace client secret-based authentication, improving security posture and reducing credential management overhead.<br/>**Migration:** Use the default `KEYCLOAK_CLIENT_MODE: AUTO` or `SIGNED_JWT`. Ensure the `uds-operator` client in the UDS Keycloak Realm uses the **Signed JWT - Federated** authenticator. | 2.0.0 | -->

## Recently removed

This section lists features that were removed in recent major releases for historical reference.

| Feature                                                     | Deprecated In | Removed In | Migration                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keycloak `x509LookupProvider`, `mtlsClientCert` helm values | 0.47.0        | 1.0.0      | Use `thirdPartyIntegration.tls.tlsCertificateHeader` and `thirdPartyIntegration.tls.tlsCertificateFormat`; remove any existing overrides utilizing the removed values                                                                                                                              |
| `CA_CERT` Zarf variable                                     | 0.58.0        | 1.0.0      | Use `CA_BUNDLE_CERTS` instead                                                                                                                                                                                                                                                                      |
| Keycloak `fips` helm value                                  | 0.43.0        | 1.0.0      | FIPS mode is now always enabled; remove any `fips` overrides from your values including `fipsAllowWeakPasswords`. See [Enable FIPS Mode](https://github.com/defenseunicorns/uds-core/blob/main/docs/how-to-guides/identity-and-authorization/enable-fips-mode.mdx) for password handling guidance. |
| `operator.KUBEAPI_CIDR`, `operator.KUBENODE_CIDRS`          | 0.48.0        | 1.0.0      | Use `cluster.networking.kubeApiCIDR` and `cluster.networking.kubeNodeCIDRs` instead                                                                                   |
