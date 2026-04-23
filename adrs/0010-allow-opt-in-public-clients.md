# 10. Allow opt-in public SSO clients

Date: 2026-04-20

## Status

Accepted

## Context

UDS Core has historically rejected Public Keycloak Clients unless they are configured exclusively for the OAuth 2.0 Device Authorization Grant. The restriction was introduced in [uds-core#630](https://github.com/defenseunicorns/uds-core/pull/630) with an additional defensive measure that the Standard Flow had to be disabled.  

At the same time, customers have requested to enable Public Clients a few times already (see [CORE-27](https://linear.app/defense-unicorns/issue/CORE-27/consider-allowing-public-clients) and [uds-core#1292](https://github.com/defenseunicorns/uds-core/issues/1292)) with a compelling argument that some Single Page Applications have no means of securing the Client Secret and changing the architecture is unfeasible. 

### Arguments for keeping public clients restricted

These arguments come from the June 2025 and April 2026 product-support discussions, principally from Blake Burkhart, Micah Nagel, and Sebastian Laskawiec.

- **JWTs in the browser are a cross-app risk.** Tokens in JavaScript storage can be replayed against any app in the realm with weak `aud` validation. At least one recent Keycloak CVE was exploitable only with a public client plus a valid JWT.
- **Public clients enable common attack vectors.** Authorization-code interception, open-redirect abuse, and token theft via XSS or malicious extensions are significantly more dangerous without a second credential. PKCE mitigates code interception but does nothing for token theft or redirect abuse.
- **Public clients have the highest attack surface.** Each step down the auth hierarchy—admin-gateway (network-restricted) → Authservice (no unauthenticated access) → confidential client (backend holds credentials) → public client (browser holds no credentials)—increases the blast radius of misconfiguration and CVE exploitation.
- **PKCE is a minimum requirement, not a best practice.** Federated client authentication (Signed JWT + Kubernetes Service Accounts, per [Keycloak's federated client authentication](https://www.keycloak.org/2026/01/federated-client-authentication)) is strictly stronger when the architecture allows it.

### Arguments in favor of Mission Heroes using public clients

- **SPAs with native OIDC + PKCE were rejected.** Package CRs requesting `publicClient: true` + `standardFlowEnabled: true` with PKCE for user authentication were blocked by the operator, creating friction for apps already built around this pattern.
- **Split frontend/backend deployments were forced into architectural rewrites.** Apps with static frontends and backends on different origins could not be made to work cleanly under Authservice due to audience and redirect-URI constraints. Significant restructuring was required.
- **Keycloak's own admin console is public + standard flow.** The built-in `security-admin-console` is already used in production for CAC-authenticated realm management.
- **Existing workarounds bypass operator lifecycle management.** Public clients were created manually via the Admin UI or Terraform, avoiding the UDS Operator entirely and reducing platform visibility.

## Decision

We will allow public SSO clients in UDS Core as an **explicit, default-off opt-in** enforced at the **UDS Operator admission layer** (Pepr) via a new `ALLOW_PUBLIC_CLIENTS` key in the `uds-operator-config` Secret.

The above translates technically to:

1. **Default off.** `ALLOW_PUBLIC_CLIENTS` defaults to `"false"`. UDS Core's out-of-the-box posture is unchanged: non-device-flow public clients are rejected by admission.
2. **Device flow stays allowed by default.** A public client with `standardFlowEnabled: false` and the `oauth2.device.authorization.grant.enabled` attribute set to `"true"` is still accepted without the flag. Device flow is browserless, has no redirect URI to intercept, and is already in production use for Sigstore and similar CLI workloads; breaking it would be a regression.
3. **Always-enforced PKCE for non-device-flow public clients.** When the flag is on, the admission validator rejects any public client that does not set `pkce.code.challenge.method` to a non-blank value. The specific method choice (`plain` or `S256` per RFC 7636) is not pinned by admission; Keycloak enforces the challenge method string itself at the authorization endpoint. Operators and app owners are expected to prefer `S256`, since `plain` transmits the challenge equal to the verifier and does not mitigate authorization-code interception.
4. **Admission blocks misuse-of-publicClient combinations.** Even with the flag on, a non-device-flow public client cannot set `serviceAccountsEnabled`, `secret`, `secretConfig`, `enableAuthserviceSelector`, or `protocol: saml`. PKCE is OIDC only, and Keycloak Client Policies scope their public-client rules to OIDC, so a SAML public client would bypass meaningful mitigations.
5. **Enforcement stops at UDS Operator admission.** Keycloak-side enforcement (the UDS Client Profile's `allow-public-clients` executor in uds-identity-config) is intentionally left unchanged. Adding a realm-wide gate would be a breaking change for clusters that have already created public clients via the Admin API or OpenTofu, and the current realm-init pipeline has no per-cluster migration story. The trade-off is that the flag can be bypassed by administrators who create clients outside the operator; tightening this at the Keycloak layer is deferred to a major release.
6. **Docs carry an explicit warning.** The identity-and-authorization reference and the "Configure user accounts and security policies" how-to guide spell out that public clients are a common stepping stone for attacks and CVE exploitation, restate the ladder of auth patterns, and recommend a confidential client or Authservice whenever the architecture allows.

## Consequences

### Positive

- Mission Heroes with legitimate SPA-style PKCE use cases can now configure public clients through the standard UDS Package CR path instead of bypassing the operator.
- The opt-in lives with the other `uds-operator-config` settings. A cluster admin has to make a conscious choice.
- Existing device-flow packages (Sigstore and similar) are unaffected. The change is fully backwards compatible for the dominant existing use of `publicClient: true`.
- No Keycloak-side behavior change ships in this release, so existing clusters with any public clients in Keycloak continue to reconcile without disruption.

### Negative

- An admin who enables the flag without reading the warning can permit a Mission Hero to ship a public client with weaker controls than `Authservice`-fronted confidential clients.
- Admission-only enforcement can be bypassed by creating a public client directly in Keycloak (Admin API, OpenTofu, Admin UI). The platform still depends on operator-managed clients for the gate to hold.
- Public clients by their nature put JWTs into the browser. If a downstream app in the same realm does not validate `aud` correctly, that JWT is reusable against it. This risk cannot be closed by the platform; it is an application responsibility and has to be carried in the docs and review guidance.

## Alternatives Considered

1. **Keep the blanket rejection and route every SPA use case through Authservice.** Rejected. Authservice forces significant rewrites or complex CORS setups, causing the UDS Operator to be bypassed.
2. **Allow public + standard flow unconditionally once PKCE is present.** Rejected. Public clients have the highest attack surface; an explicit opt-in was chosen to preserve secure-by-default posture.
3. **Also enforce the flag in the uds-identity-config Keycloak plugin.** Deferred. Plugin-side enforcement would cover clients created outside the operator but becomes a breaking change for any cluster that already has non-device-flow public clients in Keycloak, and our current realm-init path has no safe migration. Revisit in a major release.
