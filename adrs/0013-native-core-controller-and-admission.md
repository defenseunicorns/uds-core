<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# 13. Native Core controller, admission, and image distribution

Date: 2026-11-01

## Status

Accepted.

## Context

Core needs predictable admission cost and independent reconciliation without a JavaScript runtime. The replacement must preserve the Package API and resource ownership while retiring Pepr completely. Admission availability, exemption revocation, and a recoverable one-time writer handoff are part of the installation contract.

## Decision

Kubernetes 1.36 is the hard minimum because Core requires the stable native mutating admission v1 APIs. CEL owns object-local validations and defaults. Go webhooks own contextual Istio and waypoint decisions and custom-resource validation. Both evaluate one revisioned exemption union. Exemption names use RE2 unanchored search with generateName fallback. Empty patterns continue to match every name. ECMAScript-only patterns are an accepted minor breaking change; preflight rejects existing incompatible patterns before draining Pepr. Historical invalid matchers degrade individually, with Events, logs, and snapshot annotations. Informational mutation diagnostics reset noncanonical content instead of executing JavaScript.

Raw client-go remains the operator framework. Existing typed informers, workqueues, leases, UID ownership checks, and admission serving are already implemented and tested against it. A controller-runtime port would expand this migration without changing the desired ownership contract. One elected controller writes; every replica serves admission. Lease loss cancels and drains the writer workers, then the replica campaigns again without stopping admission. The controller releases a lease explicitly after workers stop: client-go's automatic release happens before the stopped-leading callback and could expose a second writer too early. Informer queues retain pending work across leadership epochs.

Packages in different namespaces reconcile concurrently. Namespace changes and shared egress, UDP gateway, authservice, and blackbox configuration retain scoped serialization. Owned-resource apply keeps its ownership and resourceVersion precondition, with bounded conflict retries that recheck ownership. Unconditional force-apply would reduce reads but could overwrite another Package's resource during an ownership race. Reconciliation retries use an approximately two-minute delay budget without blocking workers and publish Warning Events. Readiness transition timestamps change only when readiness changes.

Admission maintenance has its own Kubernetes request budget. Name-filtered informers trigger certificate and registration reconciliation; timer checks cover renewal and trust-overlap deadlines. The serving process exposes bounded-cardinality decision counters and structured denial logs. Liveness checks the local listener, while readiness checks synchronized trust. A startup probe allows initial caches to synchronize.

The compiler exclusively authors AdmissionParameters. Helm does not seed or own the grant snapshot. A parameter-free validating policy protects writes from bootstrap onward; only the controller service account may write, and the namespace controller may delete during namespace teardown. Exemptions remain read-only inputs for the controller.

Ephemeral-container admission evaluates current policies without requiring the Pod's creation-time mutation revision. Kubernetes resets metadata during that subresource update, so a fresh mutation stamp cannot survive to validation. Main-resource Pod requests retain the revision fence. Service mutations only write informational annotations, so Service validation uses current grants directly without a mutation-revision fence. API-server tests on Kubernetes 1.36 and 1.37 cover debug-container updates, parameter protection, and native versus Go defaults; CEL differential tests execute all eighteen Pod and Service validations against pinned inputs.

The transition is one-way. Package create includes host helpers for Linux and macOS, on amd64 and arm64. Zarf extracts them into its managed temporary directory; they use the same existing Kubernetes credential loading rules as Zarf. The installer never exports an admin kubeconfig. Deploy hosts need a writable working directory and executable temporary storage; Zarf's temporary-directory option supports hosts with a noexec default. Windows deploy hosts are not supported by these helpers.

Preflight checks the version, APIs, and RE2 migration. Installation adopts supported existing API ownership, starts mesh trust, drains the old writer, waits for the replacement's caches and exemption snapshot, verifies admission using a dedicated scratch namespace, then retires only Core-owned Pepr resources. Failures after handoff recover forward by rerunning against the same cluster; they never restart the Pepr writer. Existing resource UIDs and legacy Package finalizers remain supported. Repeat installation preserves active admission, and runtime repair recreates deleted webhook registrations only for the current installation's lifecycle UID.

Two controller image flavors remain:

| Flavor   | Runtime base                               | Crypto build                                                                           | Publication                                             |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| upstream | Public Chainguard static, pinned by digest | Static Go, CGO disabled                                                                | ghcr.io/defenseunicorns/uds-core/controller             |
| unicorn  | Public Chainguard static, pinned by digest | Licensed Chainguard go-fips compiler, pinned by digest, with its native Go FIPS module | ghcr.io/defenseunicorns/packages/private/uds/controller |

The organization licenses Chainguard's go-fips compiler. Unicorn builds use the pinned 1.27.3 compiler image without overriding its FIPS module or enforcement defaults. The organization has no static-fips repository. Following [Chainguard's documented Go FIPS layout](https://images.chainguard.dev/directory/image/go-fips/overview), the statically linked binary runs on the minimal static base; cryptography belongs to the binary, not an alternate runtime library. The PR owner approved this builder/runtime combination after checking the authenticated image catalog.

Unicorn binaries inspect crypto/fips140.Enabled() before starting and refuse to run with FIPS disabled. Build receipts record the compiler image digest and version, module settings, static ELF checks, input hashes, runtime base digest, and runtime mode. The installer verifies the unicorn self-check in every running controller replica. Webhook TLS retains TLS 1.2 minimum and does not override Go's FIPS suite restrictions.

Registry1 is being retired. Until repository-wide removal lands, registry1 packages carry the upstream controller image and make no controller FIPS or Iron Bank claim.

CI builds each image flavor and architecture; tag and scheduled snapshot releases publish multi-architecture manifests. Images are signed keylessly with cosign using GitHub OIDC, following [ADR 0011](0011-keyless-sign-uds-core-packages.md). Architecture images carry signed SPDX SBOM attestations; the manifest index is signed too. Formal releases use tag provenance; scheduled snapshots use main-branch provenance, matching ADR 0011. The private GHCR namespace and GITHUB_TOKEN authentication match existing Core package publication. Licensed base pulls use CHAINGUARD_IDENTITY. Host helper binaries are release assets.

Package creation references published images and helpers; it does not compile Go or invoke Docker/buildx. Development and integration CI can explicitly build source artifacts and provide CONTROLLER_IMAGE and CONTROLLER_TOOLS_DIR overrides. The wrapper applies overrides in a temporary source copy; image choice is not a deployment variable.

The frozen Pepr oracle is historical evidence, run only by workflow_dispatch. Its original source remains pinned at 129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c. It retains unchanged source captures; intentional RE2 and diagnostic changes have their own unit and CEL differential tests. Go tests, race checks, generated-contract checks, and end-to-end installs/upgrades gate the replacement. Keep the oracle through initial migration qualification; remove it in a later reviewed change once retained evidence and current coverage are sufficient.

## Alternatives considered

- A Kubernetes transition Job adds bootstrap scheduling, image-pull, credential, and lifecycle dependencies before the replacement is healthy. Host actions fit Zarf's existing deployment model and inherit its authentication.
- Pepr coexistence or rollback introduces two possible writers and incompatible ownership recovery. The transition instead preserves one writer and recovers forward.
- A Go-only webhook keeps avoidable API-server round trips for local policy decisions. CEL handles those decisions directly.
- JavaScript regex compatibility adds runtime and resource costs for tenant patterns. RE2 is shared by Go and CEL and rejects unsupported syntax at write time and before upgrade.
- Building images during package creation requires Docker and an exact compiler on every packaging host. Published artifacts restore the existing component packaging model.
- One upstream image for all flavors does not satisfy the unicorn FIPS requirement. A registry1-specific controller is unnecessary during its retirement.
- Google distroless remains a possible upstream-only fallback if the public Chainguard image becomes unavailable; it is not selected because the public static image resolved successfully.

## Consequences

The migration requires Kubernetes 1.36 and remediation of incompatible regexes before handoff. Deploy hosts retain the documented helper OS, architecture, filesystem, and authentication requirements. Release publication must produce images and helper assets before packages consume them. New private GHCR packages must retain private visibility and the existing organization access policy; a private-looking path alone does not configure registry access.

See the [upgrade guide](../docs/operations/upgrades/native-controller-transition.md) for namespace, values, metrics, Keycloak principal, and recovery changes, and the [admission contract](../src/go-controller/native-admission/README.md) for enforcement details.
