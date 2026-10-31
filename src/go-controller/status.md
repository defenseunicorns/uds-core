<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# Core operator replacement

Core base and standard install the Go operator and Kubernetes CEL admission policies by default. Functional layers and the Legacy and Next standard, slim, and HA bundles consume the same base. Application Packages continue to use the `Package`, `Exemption`, and `ClusterConfig` APIs without selecting an operator implementation.

## Ownership and admission

One elected Go controller owns all Package reconciliation phases, including networking, Istio, SSO, monitoring, uptime, CA bundles, and reload. New Packages use `uds.dev/finalizer`; deletion also completes existing `pepr.dev/finalizer` ownership. Native policies enforce object-local decisions. Go callbacks handle contextual checks, resource validation, waypoint behavior, and JavaScript-compatible exemption matching that cannot be expressed faithfully in CEL.

The compiler publishes one protected, revisioned exemption union. Unsupported JavaScript regular expression features delegate the relevant scope to Go. Missing or invalid parameters fail closed. Source UID ownership, leader replacement, serving trust, drift recovery, and revocation remain part of the contract.

## Installation and upgrade

Core checks for the required native admission v1 APIs before changing ownership. It preserves API object UIDs, starts the mesh with bootstrap trust, drains the previous Core writer, and waits for the Go controller's complete caches and compiled snapshot. It then verifies the full CEL/webhook contract and actual mutation/rejection canaries before retiring Core's old module, credentials, runtime stores, and release records.

Repeat upgrades preserve active admission registrations through the bootstrap phase. Retirement uses live ownership checks and immutable deletion preconditions. Other modules, shared namespaces, and shared PeprStore CRDs are outside Core's retirement boundary.

## Verification entry points

The [controller workflow](../../.github/workflows/native-controller.yaml) runs Go race tests, vet, vulnerability checks, API/client regeneration, chart assertions, admission renders, and distribution ownership checks. It exports the pinned pre-replacement source to an external directory and executes its unchanged 1,117-test suite plus 372 capture tests that check all 1,418 current-source differential cases.

The regular Core workflows build the replacement from source and run the existing API and browser suites against the installed default distribution. They do not select a separate native profile. Runtime identity remains the existing Keycloak service; the independent identity-provider PR supplies no dependency of this replacement.

See the [controller guide](README.md) for build details and the [admission contract](native-admission/README.md) for routing and recovery.
