# Package SSO security audit

Generated: 2026-09-24. Scope: UDS Core shipped Helm/Zarf packages, Package SSO configuration, Keycloak ingress, and the UDS Identity Config realm. Tracks CORE-692 and CORE-694; cookie hardening also overlaps CORE-693. This report does not close those tickets.

## Shipped client inventory

The source inventory includes the imported Portal chart. Test fixtures are separate from shipped application clients.

| Application | Client ID | Trusted HTTPS origin | Required redirect URIs | Result |
|---|---|---|---|---|
| Grafana | `uds-core-admin-grafana` | `https://grafana.<adminDomain>` | `/login/generic_oauth`, `/login` on that origin | Explicit exact `webOrigins`; both exact redirects retained |
| UDS Portal v0.5.2 | `uds-portal` | `https://<package.host>.<package.domain>`; default `https://portal.uds.dev` | `/auth` on that origin | Exact callback exists; `webOrigins` is absent in the imported chart |

Grafana uses `/login` as its `post_logout_redirect_uri` in [the application values](src/grafana/values/values.yaml). Removing it would break logout. Portal's [pinned Package template](https://github.com/defenseunicorns/uds-portal/blob/v0.5.2/chart/templates/uds-package.yaml) has no origin override. Correcting it requires a Portal chart change and a subsequent Core version update.

The remaining Core source packages do not declare application `spec.sso`. Test fixtures declare `uds-core-ambient-httpbin`, `uds-core-ambient2-httpbin`, `uds-core-sidecar-httpbin`, `uds-test-tenant-app`, and `podinfo`; their existing behavior remains unchanged. No organization-wide audit of independent `uds-packages` repositories was performed.

## Findings

The following counts describe the confirmed transport and forwarding gaps before these changes. Missing `webOrigins` does not by itself prove permissive CORS; an empty allowlist can deny access.

| Severity | Count |
|---|---|
| Medium | 1 |
| Low | 2 |

### Medium: client-supplied forwarding headers alter discovery

Location: [Keycloak Package template](src/keycloak/chart/templates/uds-package.yaml).

Before the change, a request containing `X-Forwarded-Host: unapproved.example` and `X-Forwarded-Port: 81` returned `https://unapproved.example:81/realms/uds/protocol/openid-connect/token` in discovery. A client consuming discovery with attacker-controlled forwarded metadata could send token requests to that host. The test establishes metadata injection, not a demonstrated credential theft.

The routes now overwrite forwarded host, scheme, and port with the configured HTTPS authority and remove `Forwarded` and `X-Forwarded-Prefix`. They preserve the existing client-certificate handling and gateway client-IP processing. Integration tests verify public and admin discovery under spoofed headers.

### Low: gateway responses omit HSTS

Location: [Keycloak Package template](src/keycloak/chart/templates/uds-package.yaml).

The public root redirect previously omitted HSTS. Browsers receiving only those responses would not learn the HTTPS policy, leaving subsequent HTTP navigation exposed to network interception.

All three Keycloak expose entries now remove upstream HSTS and add one `strict-transport-security: max-age=31536000; includeSubDomains` header. Tests cover redirects, discovery, real static resources, `/public/logo.png` (currently a 404), and `/realms/master/` through both gateways. HTTP redirects remain enabled.

### Low: generated affinity cookie lacks Secure

Location: [Keycloak DestinationRule](src/keycloak/chart/templates/destination-rule.yaml).

Without `Secure`, a browser can send the affinity cookie over HTTP. A network observer could read or modify routing affinity. This cookie is not an authentication token.

The existing Istio cookie configuration now adds the native `Secure` attribute. The local response contains `Secure; HttpOnly`. SameSite behavior remains unchanged. A rendered HA DestinationRule exercised cookie generation against one local Keycloak pod; this does not establish multi-replica affinity or failover behavior.

## Service-account scope restrictions

The companion Identity Config change removes the unused `uds-operator` redirect and sets `fullScopeAllowed: false` on three clients. Required service-account role grants remain in place, with matching explicit client scope mappings:

| Client | Explicit `realm-management` scope role | Browser flows |
|---|---|---|
| `uds-operator` | `manage-clients` | Standard, implicit, and direct access grants disabled |
| `uds-opentofu-client` | `realm-admin` | Standard, implicit, and direct access grants disabled |
| `uds-fleet-admin` | `manage-clients` | Standard, implicit, and direct access grants disabled |

Keycloak intersects service-account role grants with client scope mappings when full scope is disabled. Changing the flag without adding those mappings would remove required token roles. OpenTofu retains its existing realm administration role; reducing that role requires a separate provider-operation inventory.

Existing realms do not automatically reimport these defaults. Apply the equivalent client scope mappings before disabling full scope, or follow the [realm upgrade procedure](docs/operations/upgrades/upgrade-keycloak-realm.mdx). The generic Package CR default remains unchanged, as tracked separately by CORE-669.

## HSTS policy decision

This change covers only Keycloak's `sso.<domain>` and `keycloak.<adminDomain>` routes on the tenant and admin TLS-terminating gateways. Admin authentication needs the same transport protection. It introduces no platform-wide policy, custom gateway policy, passthrough mutation, or EnvoyFilter.

`includeSubDomains` covers descendants of each response hostname, not sibling application hosts. The local `sso.uds.dev` and `keycloak.admin.uds.dev` routes terminate HTTPS; Core declares no descendant hosts beneath them. Operators must verify descendant HTTPS coverage and external load-balancer header behavior for their own domains. This audit cannot attest to unknown customer DNS or proxy configurations. The header matches Keycloak's existing realm HSTS policy.

## CORS and built-in endpoints

The Operator copies `webOrigins` and `redirectUris` into the same client representation and sends both on client creation and update. The deployed Grafana Package and Keycloak client have the exact expected lists.

Authenticated Grafana token requests with an invalid authorization code return a readable 400 to the approved origin and reject an unapproved origin with 403 and no CORS allow-origin header. Both gateway paths receive this check. Unlisted redirects are rejected before redirection.

Discovery and preflight endpoints intentionally reflect arbitrary origins. Invalid-client authentication errors can also expose public error responses before client-specific origin checks. These responses do not demonstrate access to authenticated data. Gateway routes append `Vary: Origin` without replacing existing variation headers; discovery also uses `no-store`.

Built-in account clients remain separate from Package SSO configuration. Browser tests exercise same-origin and unapproved-origin `account-console` token requests without client secrets, plus real OIDC cookie-check iframe messaging. Existing account callback patterns remain unchanged.

## Verification

Local checks use `k3d-uds`, Keycloak 26.7.3, and Istio 1.30.3. The Identity Config image was built from the companion branch, published temporarily to `ttl.sh`, deployed, and imported into a fresh local `uds` realm. No temporary image reference is committed to production configuration.

| Check | Evidence |
|---|---|
| Keycloak Helm tests | 115 passed |
| Grafana Helm tests | 5 passed |
| Monitoring values rendering | 36 passed, including default and custom domains |
| Operator unit tests | 1,092 passed |
| Ingress, Grafana origin, hostname, and Fleet integration | 26 passed against the temporary Identity Config image |
| Browser account CORS, OIDC iframe, and Grafana login/logout | 7 passed against the temporary Identity Config image |
| Identity Config image | Multi-architecture build and generated realm assertions passed |
| Identity Config Cypress | 16 passed: client credentials, OpenTofu, and Fleet |
| PR checks and external reviewers | Pending |

## Outstanding evidence

Portal still needs an explicit origin in its upstream chart. The Notion security response was inaccessible through the available tools; this report supplies the draft evidence for that response. Full HA failover, customer custom-domain HTTPS coverage, external load-balancer combinations, and every authenticated account write operation remain outside the local evidence above. Keep CORE-692 open until its accepted follow-ups and evidence requirements are resolved.

## Related documentation

- [CORE-692](https://linear.app/defense-unicorns/issue/CORE-692): Package security evidence tracker.
- [CORE-694](https://linear.app/defense-unicorns/issue/CORE-694): HSTS remediation.
- [Keycloak reverse proxy configuration](https://www.keycloak.org/server/reverseproxy): trusted forwarding metadata.
- [Istio HTTP headers](https://istio.io/latest/docs/reference/config/networking/virtual-service/#Headers): native route header operations.
