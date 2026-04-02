---
title: Identity & Authorization
description: Complete reference for UDS Core identity and authorization configuration, covering Keycloak Helm values, realmInitEnv variables, theme and plugin settings, and SSO defaults.
sidebar:
  order: 3.001
---

UDS Core provides identity and access management through Keycloak, configured by the `uds-identity-config` component. This page documents the UDS-specific configuration surfaces exposed to bundle operators: the Helm chart paths, environment variables, and defaults that control realm behavior, authentication flows, themes, plugins, and account security.

## Keycloak configuration overview

UDS Core manages four areas of Keycloak configuration through the `uds-identity-config` component:

- **Realm configuration:** authentication flows, session timeouts, password policy, identity providers
- **Theme configuration:** branding images, terms and conditions, registration form fields
- **Truststore:** CA certificates used for X.509 client authentication
- **Custom plugins:** Keycloak extensions bundled with UDS Core

Non-persistent components (themes, truststore, plugins) are automatically updated when the Keycloak package is upgraded. Realm configuration is persisted in Keycloak's database and does **not** automatically update on upgrade; see [Upgrade Keycloak realm](/operations/upgrades/upgrade-keycloak-realm/) for manual steps.

## Realm initialization variables

Variables under the `realmInitEnv` Helm chart path configure the `uds` Keycloak realm during its initial import. These values are **not** applied at runtime. To change them on a running cluster, you must destroy and recreate the Keycloak deployment to trigger a fresh realm import. See [Upgrade Keycloak realm](/operations/upgrades/upgrade-keycloak-realm/) for version-specific steps.

Bundle override path: `overrides.keycloak.keycloak.values[].path: realmInitEnv`

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_IDP_ENABLED` | `false` | Enable the Google SAML identity provider |
| `GOOGLE_IDP_ID` | unset | Google SAML IdP entity ID |
| `GOOGLE_IDP_SIGNING_CERT` | unset | Google SAML signing certificate |
| `GOOGLE_IDP_NAME_ID_FORMAT` | unset | SAML NameID format for Google IdP |
| `GOOGLE_IDP_CORE_ENTITY_ID` | unset | Entity ID UDS Core presents to Google |
| `GOOGLE_IDP_ADMIN_GROUP` | unset | Group name to assign admin role via Google IdP |
| `GOOGLE_IDP_AUDITOR_GROUP` | unset | Group name to assign auditor role via Google IdP |
| `EMAIL_AS_USERNAME` | `false` | Use the user's email address as their username |
| `EMAIL_VERIFICATION_ENABLED` | `false` | Require email verification before account use |
| `TERMS_AND_CONDITIONS_ENABLED` | `false` | Show a Terms and Conditions acceptance screen on login |
| `PASSWORD_POLICY` | See note | Keycloak password policy string applied to all realm users |
| `X509_OCSP_FAIL_OPEN` | `false` | Allow authentication when the OCSP responder is unreachable |
| `X509_OCSP_CHECKING_ENABLED` | `true` | Enable OCSP revocation checking for X.509 certificate authentication |
| `X509_CRL_CHECKING_ENABLED` | `false` | Enable CRL revocation checking for X.509 certificate authentication |
| `X509_CRL_ABORT_IF_NON_UPDATED` | `false` | Fail authentication if the CRL has passed its `nextUpdate` time |
| `X509_CRL_RELATIVE_PATH` | `crl.pem` | CRL file path(s) relative to `/opt/keycloak/conf`; use `##` to separate multiple paths |
| `ACCESS_TOKEN_LIFESPAN` | `60` | Access token validity period in seconds |
| `SSO_SESSION_IDLE_TIMEOUT` | `600` | Session idle timeout in seconds |
| `SSO_SESSION_MAX_LIFESPAN` | `36000` | Maximum absolute session duration in seconds, regardless of activity |
| `SSO_SESSION_MAX_PER_USER` | `0` | Maximum concurrent sessions per user; `0` means unlimited |
| `MAX_TEMPORARY_LOCKOUTS` | `0` | Number of temporary lockouts before permanent account lockout; `0` means permanent lockout on first threshold breach |
| `OPENTOFU_CLIENT_ENABLED` | `false` | Enable the `uds-opentofu-client` Keycloak client for programmatic realm management |
| `SECURITY_HARDENING_ADDITIONAL_PROTOCOL_MAPPERS` | `""` | Comma-separated additional Protocol Mappers to allow in the UDS client policy |
| `SECURITY_HARDENING_ADDITIONAL_CLIENT_SCOPES` | `""` | Comma-separated additional Client Scopes to allow in the UDS client policy |
| `DISPLAY_NAME` | `"Unicorn Delivery Service"` | The display name for the realm. |

> [!NOTE]
> The default `PASSWORD_POLICY` value is: `hashAlgorithm(pbkdf2-sha256) and forceExpiredPasswordChange(60) and specialChars(2) and digits(1) and lowerCase(1) and upperCase(1) and passwordHistory(5) and length(15) and notUsername(undefined)`.

> [!CAUTION]
> Setting `X509_OCSP_FAIL_OPEN: true` allows revoked certificates to authenticate if the OCSP responder is unreachable. Use with caution and review your organization's compliance requirements.

### Session timeout guidance

Configure `SSO_SESSION_IDLE_TIMEOUT` to be longer than `ACCESS_TOKEN_LIFESPAN` so tokens can be refreshed before the session expires (for example, 600 s idle timeout with 60 s token lifespan). Set `SSO_SESSION_MAX_LIFESPAN` to enforce an absolute session limit regardless of activity (for example, 36000 s / 10 hours).

## Authentication flow variables

Variables under the `realmAuthFlows` path control which authentication flows are enabled in the realm. Like `realmInitEnv`, these are applied only at initial realm import and require destroying and recreating the Keycloak deployment to change on a running cluster.

Bundle override path: `overrides.keycloak.keycloak.values[].path: realmAuthFlows`

| Variable                         | Default | Description                                                                                            |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `USERNAME_PASSWORD_AUTH_ENABLED` | `true`  | Enable username and password login; disabling also removes credential reset and user registration      |
| `X509_AUTH_ENABLED`              | `true`  | Enable X.509 (CAC) certificate authentication                                                          |
| `SOCIAL_AUTH_ENABLED`            | `true`  | Enable social/SSO identity provider login (requires an IdP to be configured)                           |
| `OTP_ENABLED`                    | `true`  | Require OTP MFA for username and password authentication                                               |
| `WEBAUTHN_ENABLED`               | `false` | Require WebAuthn MFA for username and password authentication                                          |
| `X509_MFA_ENABLED`               | `false` | Require MFA (OTP or WebAuthn) after X.509 authentication; requires `OTP_ENABLED` or `WEBAUTHN_ENABLED` |

> [!CAUTION]
> Disabling `USERNAME_PASSWORD_AUTH_ENABLED`, `X509_AUTH_ENABLED`, and `SOCIAL_AUTH_ENABLED` simultaneously leaves no authentication method available. MFA is not configurable for SSO flows; that responsibility shifts to the identity provider.

## Runtime configuration

Variables under the `realmConfig` and `themeCustomizations.settings` paths take effect at runtime and do not require redeployment of the Keycloak package, except where noted.

### realmConfig

Bundle override path: `overrides.keycloak.keycloak.values[].path: realmConfig`

| Field                      | Default | Description                                          |
| -------------------------- | ------- | ---------------------------------------------------- |
| `maxInFlightLoginsPerUser` | `300`   | Maximum concurrent in-flight login attempts per user |
| `accountInactivityDays`    | `0`     | Days of inactivity before a non-admin account is automatically disabled. `0` disables the feature. Satisfies APSC-DV-000320 (ASD STIG). **Applied at initial realm import only** — changes to a running instance require manual update via the Keycloak Admin Console. |

### themeCustomizations.settings

Bundle override path: `overrides.keycloak.keycloak.values[].path: themeCustomizations.settings`

| Field | Default | Description |
|---|---|---|
| `enableRegistrationFields` | `true` | When `false`, hides the Affiliation, Pay Grade, and Unit/Organization fields during registration |
| `enableAccessRequestNotes` | `false` | Enable the Access Request Notes field on the registration page |
| `realmDisplayName` | unset | Overrides the page title on the login page at the theme level, falling back to the Keycloak realm’s configured display name if unset. |

For theme image and terms overrides, see [Theme customizations](#theme-customizations) below.

## Theme customizations

UDS Core supports runtime-configurable branding overrides via the `themeCustomizations` Helm chart value. ConfigMap-based theme customization resources must be pre-created in the `keycloak` namespace before deploying or upgrading Keycloak. For simple text, the `inline` option can be used instead.

Bundle override path: `overrides.keycloak.keycloak.values[].path: themeCustomizations`

| Key                                      | Description                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `resources.images[].name`                | Image asset name to override; supported values: `background.png`, `logo.png`, `footer.png`, `favicon.png` |
| `resources.images[].configmap.name`      | Name of the ConfigMap in the `keycloak` namespace that contains the image file                            |
| `termsAndConditions.text.configmap.key`  | ConfigMap key containing the terms and conditions HTML, formatted as a single-line string                 |
| `termsAndConditions.text.configmap.name` | Name of the ConfigMap in the `keycloak` namespace that contains the terms HTML                            |
| `termsAndConditions.text.inline`         | Inline terms and conditions HTML string; use instead of a ConfigMap for simple text                       |

For steps to create and deploy these ConfigMaps, see [Customize branding](/how-to-guides/identity-and-authorization/customize-branding/).

## Custom plugins

UDS Core ships with a custom Keycloak plugin JAR that provides the following implementations.

| Name                                     | Type                   | Description                                                                                                 |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Group Authentication                     | Authenticator          | Enforces Keycloak group membership for application access; controls when Terms and Conditions are displayed |
| Register Event Listener                  | Event Listener         | Generates a unique `mattermostId` attribute for each user at registration                                   |
| JSON Log Event Listener                  | Event Listener         | Converts Keycloak event logs to JSON format for consumption by log aggregators                              |
| User Group Path Mapper                   | OpenID Mapper          | Strips the leading `/` from group names and adds a `bare-groups` claim to OIDC tokens                       |
| User AWS SAML Group Mapper               | SAML Mapper            | Filters groups to those containing `-aws-` and joins them into a colon-separated SAML attribute             |
| Custom AWS SAML Attribute Mapper         | SAML Mapper            | Maps user and group attributes to AWS SAML PrincipalTag attributes                                          |
| ClientIdAndKubernetesSecretAuthenticator | Client Authenticator   | Authenticates a Keycloak client using a Kubernetes Secret                                                   |
| UDSClientPolicyPermissionsExecutor       | Client Policy Executor | Enforces protocol mapper and client scope allow-lists for UDS Operator-managed clients                      |

### Security hardening

The plugin enforces a `UDS Client Profile` Keycloak client policy for all clients created by the UDS Operator. This policy restricts which Protocol Mappers and Client Scopes a package's SSO client may use.

To extend the allow-list, set `SECURITY_HARDENING_ADDITIONAL_PROTOCOL_MAPPERS` or `SECURITY_HARDENING_ADDITIONAL_CLIENT_SCOPES` in `realmInitEnv` (see [Realm initialization variables](#realm-initialization-variables)).

> [!CAUTION]
> Do not use the `bare-groups` claim to protect applications. Because it strips path information, two groups with the same name but in different parent groups are indistinguishable, which creates authorization vulnerabilities.

> [!NOTE]
> When creating users via the Keycloak Admin API or Admin UI, the `REGISTER` event is not triggered and no `mattermostId` attribute is generated. Set this attribute manually via the API or Admin UI.

## Account lockout

UDS Core configures Keycloak brute-force detection with the following defaults.

| Keycloak setting       | UDS Core default                       | Description                                                            |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Failure Factor         | 3                                      | Failed login attempts within the counting window before lockout        |
| Max Delta Time         | 43200 s (12 h)                         | Rolling window during which failures count toward the threshold        |
| Wait Increment         | 900 s (15 min)                         | Duration of a temporary lockout after the threshold is reached         |
| Max Failure Wait       | 86400 s (24 h)                         | Maximum temporary lockout duration                                     |
| Failure Reset Time     | 43200 s (12 h)                         | Duration after which failure and lockout counters reset                |
| Permanent Lockout      | ON                                     | Escalation to permanent lockout after temporary lockouts are exhausted |
| Max Temporary Lockouts | controlled by `MAX_TEMPORARY_LOCKOUTS` | See behavior table below                                               |

### Lockout behavior

| `MAX_TEMPORARY_LOCKOUTS` value | Behavior                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `0` (default)                  | Permanent lockout after 3 failed attempts within 12 hours; no temporary lockouts                                                         |
| `> 0`                          | Temporary 15-minute lockout after each threshold breach; permanent lockout after the configured number of temporary lockouts is exceeded |

> [!CAUTION]
> Modifying lockout behavior may have compliance implications. Review applicable NIST controls or STIG requirements for brute-force protection before changing these defaults.

## Truststore configuration

The Keycloak truststore contains the CA certificates used to validate X.509 client certificates. It is built at image-build time by the `uds-identity-config` component and is not persisted; it is refreshed automatically on every Keycloak upgrade.

The following aspects of truststore behavior can be customized in the `uds-identity-config` image:

| Customization point   | Location in image                          | Description                                                                                  |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| CA certificate source | `Dockerfile` (`CA_ZIP_URL` build arg)      | URL or path of the zip file containing CA certificates; defaults to DoD UNCLASS certificates |
| Exclusion filter      | `Dockerfile` (regex arg to `ca-to-jks.sh`) | Regular expression for certificates to exclude from the truststore                           |
| Truststore password   | `src/truststore/ca-to-jks.sh`              | Password used to protect the JKS truststore file                                             |

For X.509 authentication, the Istio gateway must be configured with the CA certificate to request client certificates. This is set via the `tls.cacert` value on the `uds-istio-config` chart in the relevant gateway component:

- Tenant domain: `overrides.istio-tenant-gateway.uds-istio-config.values[].path: tls.cacert`
- Admin domain: `overrides.istio-admin-gateway.uds-istio-config.values[].path: tls.cacert`

For steps to configure a custom truststore, see [Configure truststore](/how-to-guides/identity-and-authorization/configure-truststore/).

## FIPS mode

FIPS 140-2 Strict Mode is **always enabled** in UDS Core. The `uds-identity-config` init container automatically copies the required Bouncy Castle JAR files into the Keycloak providers directory. No override is needed to enable FIPS on a new deployment.

Bundle override paths: `overrides.keycloak.keycloak.values[].path: fips` and `overrides.keycloak.keycloak.values[].path: debugMode`

| Field | Default | Description |
|---|---|---|
| `fips` | `true` | Deprecated. FIPS 140-2 Strict Mode enabled state; always `true` in UDS Core. All deployments use FIPS mode by default |
| `debugMode` | `false` | Enable verbose Keycloak bootstrap logging; used to verify FIPS mode activation |

When `debugMode` is `true`, Keycloak bootstrap logs will contain a line like:

```console
KC(BCFIPS version 2.0 Approved Mode, FIPS-JVM: disabled)
```

`BCFIPS version 2.0 Approved Mode` confirms FIPS Strict Mode is active. `FIPS-JVM: disabled` indicates the underlying JVM is not in FIPS mode, which is expected unless the host system has a FIPS-enabled kernel.

For upgrade guidance when migrating an existing non-FIPS deployment, see [Upgrade to FIPS 140-2 mode](/how-to-guides/identity-and-authorization/upgrade-to-fips-mode/).

## OpenTofu client

UDS Core includes a `uds-opentofu-client` Keycloak client that enables programmatic realm management via the OpenTofu Keycloak provider. It is disabled by default.

Enable it at initial realm import:

```yaml
overrides:
  keycloak:
    keycloak:
      values:
        - path: realmInitEnv
          value:
            OPENTOFU_CLIENT_ENABLED: true
```

> [!CAUTION]
> The `uds-opentofu-client` has elevated `realm-admin` permissions. Protect its client secret and configure authentication flows before or alongside enabling this client, since UDS Core applies default authentication flows during initial deployment.

The client secret can be retrieved from the Keycloak Admin Console: **UDS realm → Clients → uds-opentofu-client → Credentials**.

## Related documentation

- [Configure authentication flows](/how-to-guides/identity-and-authorization/configure-authentication-flows/) - how-to guide for enabling and disabling authentication methods
- [Customize branding](/how-to-guides/identity-and-authorization/customize-branding/) - how-to guide for logo, background, and terms and conditions overrides
- [Configure truststore](/how-to-guides/identity-and-authorization/configure-truststore/) - how-to guide for building and deploying a custom CA truststore
- [Enable FIPS mode](/how-to-guides/identity-and-authorization/upgrade-to-fips-mode/) - how-to guide for enabling FIPS 140-2 Strict Mode
- [Configure service accounts](/how-to-guides/identity-and-authorization/configure-service-accounts/) - how-to guide for SSO-protected service-to-service authentication
- [Configure account lockout](/how-to-guides/identity-and-authorization/configure-account-lockout/) - how-to guide for adjusting brute-force protection thresholds
- [Configure Keycloak login policies](/how-to-guides/identity-and-authorization/configure-keycloak-login-policies/) - how-to guide for session timeouts, concurrent session limits, and logout behavior
- [Manage Keycloak with OpenTofu](/how-to-guides/identity-and-authorization/manage-keycloak-with-opentofu/) - how-to guide for programmatic realm management via the OpenTofu client
- [Configure Keycloak airgap CRLs](/how-to-guides/identity-and-authorization/configure-x509-crl-airgap/) - how-to guide for configuring CRL checking in airgapped environments
- [Upgrade Keycloak realm](/operations/upgrades/upgrade-keycloak-realm/) - version-specific steps for realm configuration changes
- [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/) - upstream Keycloak reference
- [Keycloak FIPS documentation](https://www.keycloak.org/server/fips) - upstream guide for Keycloak FIPS mode
