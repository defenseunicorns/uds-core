<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

# Historical native development Core qualification

For current results, read the [current qualification record](native-core-qualification.md).
The measurements below apply only to their recorded source and image revisions.

This ledger records historical qualification of the combined development runtime
and new source-split checks. The qualified combined checkpoint remains
0b2cc45304f783c01d3fc80178867ef350fa95bf. Earlier live results and performance
measurements apply to their recorded artifacts; they do not automatically
qualify the relocated modules or newly built bridge image. The sections retain
the chronology of failures, repairs and completed checks.

## Pinned reference and artifacts

The reference is Core 1.14.0 commit `c15677633cffa17e99656a7d7ccd1f98d7cb6e4d`,
the March Go prototype `56b292f4e2b545dca7ce9ca7d6637804ecb3a87f`, and Dex
v2.45.1 commit `11d2eeb52b42e1980e14cb91e69dd9e3faab2076`.

The C8 Go binary hash is
`1ed37e6920ab255041a055ff3cec7bdea1d7c83593e005255414f47e2a33547d`. Identity
id10 is `fc2b974dfc71c37cc150ef2242f103267b6d1a09570fe5e6f28570f21e5a95f1`, and
Dex id4 is `b4ac41206514b95ee1ebd427983106fdf998cd967efc2e4a970970d1e2e0fa1a`.
The native policy hash is
`78bb1412dfcd14590b82fa15c84ab7077384261e018f9e4e139bb43c870e9291`. Local
derivative images remain unsigned.

## Historical C8 runtime evidence

These results apply to the captured C8/id10/Dex4 artifacts. Historical failed
checkpoints remain distinct from repaired results.

| Check | Actual result |
| --- | --- |
| Original Core TypeScript units and values | 1,092 and 176 passed respectively. |
| C8 Go race suite | 1,827 tests/subtests across 25 tested packages passed; no failure or named skip. |
| Typed source capture | Six suites passed 366 source tests; all 401 captured calls remained byte-identical. |
| Native admission | 136 real API cases passed, including revision routing, topology, ownership rollover, failed desired state, repair, finalization and exact cleanup. |
| Global callback counters | Forty ordinary nonambient requests made zero Go calls. Complex and ambient cases reached required handlers. |
| Main Core suite | All 24 files ran: 142 passed, zero failed, one original procMount skip. Twenty-two source files match exactly; the two documented adaptations remain explicit. |
| Trust bundle suite | Two unchanged assertions passed against real Google HTTPS with valid and empty CA bundles. Original global configuration was restored with UID/version guards. |
| Development browser and concurrent changes | All 21 passed without retry or skip during ten persisted, audited Go-derived client updates. All changes stayed inside the browser window and the fixed 20-second deadline; maximum convergence 8.6 seconds. |
| Actual periodic recovery | The five-minute event checked 34 Packages without invalidating clean epochs. Foreground updates took 2.7–12.4 seconds. Four actual drift repairs took 3.8–8.2 seconds. |
| Identity lifecycle and restart | Real signed issuers, revocation, sessions, directory, clients and refresh checks pass with strict TLS. Immediate restart verification finished before original-token expiry. |
| Fleet switch and full suite | Disabled grants and bearer access reject; re-enable requires fresh grants. Restart retains the fresh grant and rejects the old one. Six original full-suite assertions pass within their setup deadline. |
| Exemption outage and serving CA rotation | Missing/invalid snapshot recovery passes; 79 API admissions and 158 verified TLS connections pass through actual two-replica CA rotation. |
| Chart and bootstrap helper | All 120 Keycloak chart checks and 113 helper race cases pass, including actual embedded UDS and precise terminal-Pod kubelet retirement. |
| Reproducibility | Exported source without Git metadata reproduces exact release identity and Dex binaries. Policy, image payload and rendered-object hashes are checked. |

The two main-suite adaptations select actual native operator log labels and
remove independently authored positive Probe fixtures after their assertions.
The default Pepr log selector and original allow assertions stay intact. The
full qualification stack includes actual optional monitoring, logging, Portal,
Falco and backup fixtures; it is not a slim resource sample.

## Matched Node, Deno and native measurements

The controls share identical benchmark contracts, source network fixtures, eight
verified lifecycle trials and 300 admission requests per case at concurrency one
and eight. Resource observations join stable running CRI IDs across six quiet
samples in nine Core namespaces. Cache and mutation history differ, so the table
does not establish equivalent scheduler reservations, VM density or provider
cost.

| Profile | Core RSS MiB | Core working set MiB | Admission/operator RSS MiB | Create/update/delete median seconds |
| --- | ---: | ---: | ---: | --- |
| Original Pepr/Node, two admission plus one watcher | 1419.1 | 1530.5 | 511.3 | 0.642/0.633/0.478 |
| Original Pepr/Node, one admission plus one watcher | 1286.6 | 1389.4 | 379.1 | 0.569/0.551/0.609 |
| Full Pepr/Deno, two admission plus one watcher | 1496.3 | 1653.8 | 562.5 | 0.494/0.560/0.462 |
| Native policies, Go and Dex | 436.4 | 520.2 | 51.9 | 3.555/3.493/1.374 |

The native container retains 100m CPU and 128Mi memory limits. Default-Pod
admission p50/p95 is 9.36/11.35 ms at concurrency one and 8.17/63.82 ms at
concurrency eight; the original Node topology is 5.37/7.24 and 11.60/87.43 ms
respectively. Do not claim an unconditional native speed improvement. Full Deno
retains failed raw IPC compatibility evidence and does not save memory in this
trial.

## Fresh private startup and activation

The connected development profile keeps both original gateways distinct and
selects ClusterIP for each, matching the stock comparison override. Actual TLS,
routes and authorization remain enabled; production LoadBalancer defaults are
unchanged.

Fresh fenced installation passes all 19 bootstrap stages without ever installing
Pepr in 150.62 seconds from empty storage with local cached inputs. Regular
activation replay passes in 160.27 seconds and removes the tenant fence through
the final readiness gate, with no manual policy deletion. The final candidate
package hash is
`db9cac899307d6620d2c481e19a4e8b05977e04fa4cdd4fe9a68080be5a926c7`; regular
activation is
`df644929a58ed454fdd3e8616d16b21f41bb8004b21e255a2559379e71751fb8`; the preload
is `913fb064e6f55046f959cea6b1e0198c79fae3c85068f294e57d73f6eb0d210b`.
Acquisition and build duration are separate costs.

## Isolated guest and warm sample

The same current package passes 22 native authority-object checks and eight real
admission/SSO topology canaries in a 4 GiB, six-vCPU Kata guest on a task-owned
6 GiB outer node. One actual controller-produced Agent Sandbox pool member
reaches Core readiness in 204.06 seconds. A single warm claim takes 0.3082
seconds and retains physical Pod UID, container identity, zero restarts, private
API CA and signing keys through real owner transfer. Assertions precede pool
retirement; the claimed VM remains for frontend validation.

The observed VM/shim RSS is approximately 3.74 GiB and outer charge 5.46 GiB.
Retain the 4 GiB guest and 6 GiB outer envelope. This is one sample, not a
sustained refill result or latency SLO. The initial manual enrollment,
cgroup-wrapper and readiness-grace failures stay preserved; no fabricated Ready
status or extended SDK deadline is used.

## Hosted access boundary and remaining work

Strict private frontend application/group checks and exact claimed-guest
retirement are still being completed. Task-owned relays preserve original
gateway TLS, Host/SNI, signed identity and routes; they do not implement an Ark
owner/assignment transaction.

Hosted access needs an authenticated broker bound to the accepted owner,
generation, attempt and physical guest. This fork does not implement or qualify
that broker or restore Ark's hosted UDS control. Keep the hosted chart gated
until its lifecycle and execution isolation are qualified. Rendered charts, low
process memory, Ready Pods and a warm claim alone do not establish complete
hosted qualification.

Performance tuning must preserve the final passing baseline and be measured
separately. Keep the prior unused-volume, empty-chain, field-manager,
load-balancer and terminal-Pod failures as historical evidence rather than
relabeling them as passes.

## Final C12 checkpoint, October 5

The final C12/id17/Dex7 runtime ran the complete original Core main suite inside
an isolated six-vCPU/eight-GiB Kata guest: **142 passed, zero failed, one
original procMount skip**. All 24 files executed with real egress and UDP
transport enabled. Two original trust-bundle assertions also passed: real Google
HTTPS with public CA certificates succeeds, while the empty bundle fails TLS
verification. The original global CA setting was restored with exact
UID/resource-version guards. The final full browser run is still being qualified
after the original required identity fixture was seeded; the earlier
missing-fixture failure is preserved.

C12 source fingerprint is
`1a76ea64bab5b285dfa54c21b767635d2a3a771d321597c59da30eba649f7e17`. The
controller binary remains unchanged from C11:
`d251ec9346e4039458a3d8525f7b47f4652b9cf93f05726ec8ef4e3e272b2417`. Identity
id17 binary is
`eadd99a8ab3a38f5fafd5e348add79405fcae6032f17a917b911a3cb5d3ea80d`; Dex7 is
`0a8516174a14de65d2a8feb095b62f7459fe210aca07a8aad04c78965b792967`. The
bootstrap helper and native policy definitions remain unchanged. Local
derivative images/packages remain unsigned; original inputs are verified.

Two consecutive complete identity protocol runs and the seven original private
browser checks passed without retries or skips. Actual public kubelogin S256
produces ExecCredential v1 and reaches a protected app using the same signed
subject. Signed ID-token audience pairing does not widen access-token audience.
Missing/plain PKCE reject; rotated refresh rejects old grants; delete/recreate
of a Package with the same client ID rejects predecessor grants on both issuers.
Fresh grants work, disabled users reject, and restart verification fetches fresh
discovery/JWKS. Exact fixtures/relays and temporary public-client opt-in were
independently removed/restored. These are UDS identity/transport results; the
actual Ark owner broker and retirement workflow remain separate qualification.

The live tests exposed duplicate reads, record-dependent publication work,
periodic verification queueing behind mandatory reconciliation, and deleted
client tombstones removing recreated successors. Repairs preserve security
checks, request budgets and deadlines. The final catalogue is verified before
acknowledgements; deletions with no live successor still revoke.

C12 fresh fenced cold installation passes without repair in 161.41 seconds;
regular activation passes in 181.00 seconds, releasing the fence through its
final gate. Inputs were cached. Candidate package SHA is
`7cf26323417c36a7c8b462d067dad2d731f76d4f53433e050a06e36ad9ccadbb`; regular is
`80e7d4b6c28b0c02ee71c91fd033e99d68a504b6843da82e30a86349808f905e`; preload is
`62c891be66fe36e91a947116c127292770362dafd01621ca36d31d28333e659a`.

A support-complete three-GiB native guest passes automatic SDK readiness under
its unchanged 300-second bound, including real Core/native admission and SSO.
Actual PVC creation identified K3s local-path's additional public BusyBox image;
that exact 2.16-MB helper is pinned/preloaded, without opening registry egress.
An outer DNS policy must include only the exact ready, Service-owned pinned
EndpointSlice addresses on TCP/UDP53, because Service DNAT precedes enforcement.
A fresh variant with that policy before boot passed in 141.04 seconds and passed
TLS/SAN, allowed/denied network, no outer token/device and 20 PVC writes/read
after workload replacement. Hard quota and public-domain hosting remain separate
gates.

The original Pepr 2 + 1 / Java Keycloak runtime independently passes automatic
six-GiB/six-vCPU boot in 164.97 seconds, without repair or outer restart. Its
real SDK warm claim retains the same VM, CA and signing keys. A stale version in
the probe's final pool scale-down was preserved and resumed with current guards.
Its claim time was not saved, so no latency number is invented. Warm delivery
can ship independently of the native migration after its own qualification.

## Separate resource attribution

Observed C8 admission/reconciliation RSS falls from 511.3 to 51.9 MiB; identity
namespace RSS independently falls from 613.2 to 68.6 MiB. Other Core containers
rise from 294.6 to 315.9 MiB. The combined 1,419.1 to 436.4 MiB result must not
be credited entirely to replacing Pepr. Pepr/Dex and Go/Keycloak factorial runs
are still needed for causal integration effects. Later C10 median container RSS
is 393.77 MiB: 53.29 controller, 67.34 identity and 273.15 other Core. This
excludes K3s, kernel, VM and cache costs. Falco is optional and absent from slim
samples.

C10 network-only lifecycle medians are 0.811/1.177/0.820 seconds with the
100m/128Mi controller budget; first-operation outliers remain. Assess this
measured development latency tradeoff alongside resource savings. It does not
prove that every native operation is faster. Historical rows above retain their
original checkpoint and scope.


## Independent implementation reviews, October 5

The migration now has separate review boundaries:

- [Native admission and Go lifecycle, PR #3](https://github.com/jeff-mccoy/uds-core/pull/3) retains the original Keycloak provider.
- [Standalone Dex development identity, PR #2](https://github.com/jeff-mccoy/uds-core/pull/2) defaults to the original Pepr principal and disables paired CLI audiences.
- [Combined development composition, PR #1](https://github.com/jeff-mccoy/uds-core/pull/1) targets the prerequisite integration branch containing both implementation heads.

The independent native module passes 1,788 race-tested cases across 23 tested
packages, build and vet, broad and narrow admission renders, 113 pristine
Keycloak chart assertions, and all 1,092 original Pepr unit tests. Two generation
passes reproduce all 76 API/client outputs. Original provider files and tests
remain unchanged on that branch.

Standalone identity passes 147 bridge race cases, including 54 captured Core
projection/digest cases, 279 patched-Dex race cases, 125 chart assertions and
60 actual identity/standard values checks. A Git-free export reproduces its
new bridge and unchanged Dex binaries. Its module imports no controller or
native-admission code.

The combined recipe hashes both modules separately as well as the complete
composition. It explicitly enables paired CLI authority with the exact native
controller principal and supplies the chosen image in every controller phase.
Its identity input lock now records the new bridge binary and separate OCI
index, AMD64 manifest and configuration digests. Historical C12 receipts remain
unchanged. New source checks do not establish fresh live Go/Keycloak or
Pepr/Dex parity, nor a new combined live, performance or density result.

Use the [standalone identity guide](development-identity.md) for provider
configuration and the [native controller guide](../../src/go-controller/README.md)
for admission/reconciliation ownership. Their individual rollout gates remain
explicit.


## New composition source checks

The split composition passes 20 unit assertions, including negative authority
and RBAC cases, and 130 bootstrap helper race cases with the actual trusted UDS
executable. Its fresh complete render contains 257 objects, four controller
phases with one selected image, 27 callbacks, explicit paired authority and
exact bound-controller RBAC. Preparation now reuses the original non-runtime
Pepr component declarations without requiring an unused Pepr runtime build.

The new controller build matches the qualified C12 binary hash. The bridge has
new separately recorded bytes. Rendering did not request signed input-package
verification, create a new package or install a cluster. Missing tool/module
context attempts remain in the local receipt directory; corrected source checks
are separate from those failures and from the historical live qualification.
