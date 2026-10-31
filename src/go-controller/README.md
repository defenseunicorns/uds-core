<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# UDS Go controller and native admission

This experimental implementation moves the UDS `Package` lifecycle from Pepr to
Go and uses Kubernetes admission policies for suitable validation and
defaulting. It keeps the existing Keycloak identity provider. You can review and
build this module without the separate Dex provider or the combined
development-package recipe.

The implementation extends the March Dash Days prototype and now follows the
Core 1.16 API and admission changes. It does not replace Pepr's TypeScript
authoring API or KFC for other consumers.
Production activation and provider-specific live qualification remain separate
decisions.

## Responsibilities

The elected controller reconciles owned resources and publishes protected
exemption parameters. Every replica serves its required admission handlers from
synchronized caches.

| Responsibility | Source |
| --- | --- |
| Keyed `Package` reconciliation, retries and durable finalization | `internal/controller/udspackage/` |
| NetworkPolicy, discovery and waypoint ownership | `internal/controller/network/`, `internal/controller/dependencies/` |
| Istio ingress, egress and namespace topology | `internal/controller/istio/`, `internal/controller/authpolicy/` |
| UDP exposure through Envoy Gateway | `internal/controller/envoygateway/` |
| Existing Keycloak clients, Authservice and SSO resources | `internal/controller/sso/` |
| Monitor, probe, CA bundle and reload lifecycle | `internal/controller/monitoring/`, `internal/controller/probes/`, `internal/controller/cabundle/`, `internal/controller/reload/` |
| Protected exemption publication and native policy routing | `internal/controller/admission/`, `native-admission/` |
| Remaining code admission and shared serving trust | `webhook/`, `internal/admission/` |

Reference the [native admission contract](native-admission/README.md) for grant
union, JavaScript regex compatibility, revision fencing, recovery and
certificate rotation. Tenant diagnostic annotations never authorize an
exemption.

## Ownership modes

You can select full native ownership or staged migration. Disable and drain the
previous writer before assigning a phase to Go.

| Setting | Behavior |
| --- | --- |
| `UDS_CONTROLLER_MODE=native` | Go owns all implemented reconciliation phases. |
| `UDS_OPERATOR_*_ENABLED=false` without native mode | Go owns the corresponding phase instead of Pepr. |
| Other staged flag values | Go leaves the phase to Pepr. |

The exact per-phase names remain in [feature
flags](internal/featureflags/flags.go) and [development flags](dev-flags.env).
The controller consumes the existing Keycloak management API and its configured
credential mode.

## Build and validate

Run the following commands from the module with the trusted toolchain and
isolated caches:

```bash
cd src/go-controller
GOWORK=off CGO_ENABLED=0 go build -buildvcs=false -trimpath \
  -o build/uds-controller .
GOWORK=off go test -race ./...
GOWORK=off go vet ./...
```

The [native controller workflow](../../.github/workflows/native-controller.yaml)
runs race tests, vet, current Pepr Package differential checks, API/client
regeneration and chart contracts without deployment secrets.

The [static image recipe](Dockerfile) uses a pinned non-root distroless base.
Build outputs belong in `build/`, not the source tree. Record actual source,
tool and binary digests before comparing resource measurements.

## Keep the existing identity provider

The existing Keycloak chart already supports exact administration principals
through `adminApiAllowedPrincipals`. Apply [the scoped
values](values.keycloak.yaml) to that chart to authorize the controller's mesh
principal separately from OAuth credentials. The values grant only
`cluster.local/ns/uds-system/sa/uds-controller`; they do not enable another
identity provider or change realm authentication requirements.

The original `CLIENT_SECRET` mode uses the existing `uds-operator` client
secret. `SIGNED_JWT` and `AUTO` assertion modes require their own
original-Keycloak compatibility proof; a projected token with the correct
audience does not establish that proof. Keep the controller ambient-enrolled and
its chart-generated identity egress permission. Namespace access alone does not
grant administration. Install the chart in `uds-system` with its fixed
`uds-controller` ServiceAccount. Serving trust, authenticated recovery and
topology repair use that exact identity; the chart rejects another namespace.

## Generate API clients

The generator reads Core's actual `Package` and `ClusterConfig` schemas. The
layout file provides stable Go names instead of duplicating the schema. Do not
hand-edit generated API/client output.

Regenerate from the repository root and require identical output on a second
pass:

```bash
node src/go-controller/hack/generate-api.mjs
src/go-controller/hack/update-codegen.sh
```

## Package and rollout boundary

The [controller package](zarf.yaml) contains only this backend and its chart.
Supply the exact controller image template and matching image values before
creating it. A dormant backend becoming Ready does not establish native
admission activation. Qualify the complete webhook registrations, policy/binding
union, parameters and fallback canaries before enabling the narrower routing
mode.

The combined Core bootstrap, Dex profile and historical end-to-end qualification
belong to a separate integration review. This branch leaves Core's Keycloak
chart and identity bundle schemas unchanged. The Loki test accepts
`UDS_CORE_OPERATOR=native` to check the controller's actual log labels; its
default remains Pepr. Source tests and
rendering on this branch do not establish an independently repeated live
Go-plus-Keycloak installation.

## Related documentation

The following pages describe the implementation boundaries:

- [Native admission](native-admission/README.md) defines policy semantics and recovery.
- [Migration status](status.md) records this branch's validation and limitations.
- [Identity configuration](../../docs/reference/configuration/identity-and-authorization.mdx) describes the existing provider.
