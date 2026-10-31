<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# Controller and admission migration status

This branch contains Go reconciliation and native admission against Core 1.16,
with the existing Keycloak API as its identity boundary. The standalone Dex
runtime and combined development deployment recipe have separate reviews. No
code in this module imports or builds Dex.

## Implemented boundary

The controller implements `Package`, network, Istio, SSO, monitor, probe, CA and
reload lifecycle. Native policies handle suitable object-local decisions; Go
retains complex topology and JavaScript-compatible exemption behavior. Protected
grant union, source UID ownership, revision fencing, drift recovery, leadership
and shared webhook trust remain part of the controller contract.

Public S256 client pairing adds authenticated `Package` provenance only for
explicitly paired clients. Ordinary Keycloak client serialization retains its
original representation. Those identity-neutral operator fields do not require
the separate Dex service.

## Validation scope

The split runs its own Go race suite and chart/admission checks. The integrated
draft's earlier 1,878-case suite includes identity packages, so that total does
not describe this module. Likewise, earlier full Core/browser results used the
combined native/Dex profile and remain integration evidence, not an independent
Go-plus-Keycloak live pass.

Core's original Keycloak chart and bundle identity schemas are
byte-identical to upstream `129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c`. The exact identity
administration override lives in `values.keycloak.yaml` and selects only the Go
controller's principal through an existing chart value. The Loki log assertion
selects actual native labels when you set `UDS_CORE_OPERATOR=native`; its Pepr
default remains unchanged.

## Historical split-source result

The original independent module passed 1,788 Go race-tested cases across 23 tested
packages, with zero failures or skipped test cases. The standalone controller
build and vet passed. Both complete and narrowed admission renders passed the
existing contract checker. All 113 original Keycloak chart assertions passed.
These results describe the earlier Core 1.14 source split, separate from prior
integrated live runs.

## Current source checks, October 31

The update incorporates upstream `129d6e4a1928ce2b10ba6c5c8b5a0e7350f4053c`.
Go now preserves `redirect.prefixRewrite`, rejects `Package` spec changes during
deletion, and reserves generated probe client IDs. Egress cleanup guards the
inspected UID and resource version. The elected compiler repairs missing or
modified admission parameters without requiring another admitted source change.
Generated uptime clients explicitly select confidential authentication so Java
Keycloak creates their service-account secrets. The module and CI require Go
1.27.3; patched `x/net` and its required dependencies replace the earlier
HTTP/2 and text-processing versions.
The chart requires `uds-system` so its
serving and recovery identities match the runtime.

The current checks produce these results:

| Check | Result |
| --- | --- |
| Go race suite | 1,807 tests/subtests pass across 23 tested packages; no failed or skipped test cases. |
| Static build and vet | Pass. |
| Original Pepr unit suite | 1,117 tests pass across 58 files. |
| Current Package differential fixture | 140 decisions from 136 original source tests match Go, including previous-object checks. |
| Keycloak chart | 120 tests pass. |
| Native controller chart | Both namespace-boundary tests pass. |
| Broad and narrowed admission renders | Both contract checks pass. |
| API/client regeneration | All 76 files remain identical on a second pass. |

The [native controller workflow](../../.github/workflows/native-controller.yaml)
repeats the module, current Package differential, generation and chart checks
without deployment secrets. These source checks do not establish a live
Go-plus-Keycloak pass.

## Rollout gates

You must qualify a fresh installation with the original identity provider before
enabling this branch for routine development. Verify actual SSO, Fleet/probe
credential modes, leader replacement, registered admission, exemption
revocation, certificate rotation, drift and guarded retirement. Do not assign
two active writers to the same phase.

The combined development bootstrap and the historical resource measurements
remain separate. This source split does not claim new memory, startup, density
or cost results. It does not migrate other Pepr modules or KFC.

## Related documentation

The following contracts describe the source:

- [Controller guide](README.md) lists modes, build commands and identity configuration.
- [Native admission](native-admission/README.md) defines authority, routing and recovery.
