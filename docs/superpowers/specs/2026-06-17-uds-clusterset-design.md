# UDS ClusterSet — Design (Hackathon POC)

Date: 2026-06-17
Status: Draft for team review
Authors: 3-engineer hackathon team

## 1. Summary

UDS ClusterSet is a proof-of-concept multicluster capability for UDS Core. It makes
cross-cluster service discovery feel native to UDS: a workload author marks a service
as multicluster on the Package CR they already write, and that service becomes
resolvable from another cluster at `<service>.<namespace>.svc.clusterset.local`.

Submariner provides the cross-cluster networking and DNS (Lighthouse). UDS provides
the native experience: a `ClusterSet` CRD for membership and status, and an operator
that turns declared intent into Submariner `ServiceExport` resources.

Scope is a working demo over production readiness. The target is two clusters where a
service exported from one is reachable and DNS-resolvable from the other, driven by
UDS-native primitives.

## 2. Goals and non-goals

### Goals
- ClusterSet CRD expressing cluster membership and aggregated status.
- Native intent: a multicluster field on the existing Package CR drives export.
- Operator reconciler that creates/deletes Submariner `ServiceExport` from that intent.
- Aggregated ClusterSet `.status` read from Submariner CRs.
- Reproducible, shareable two-cluster local dev environment (k3d).
- Demo: export a service from the hub cluster, resolve and reach it from the edge.

### Non-goals (this hackathon)
- Istio multicluster backend, Cilium ClusterMesh backend.
- Real Go `uds multicluster` CLI (stretch only; MVP uses `subctl` for plumbing).
- Operator-driven cluster join (broker token flow stays with `subctl`).
- Federated identity, cross-cluster package deployment, traffic management, DR, fleet
  management, GitOps integration. These are future roadmap.

## 3. Backend choice: Submariner

Submariner is cloud-provider agnostic, works on-prem and in cloud, and fits a 2-day
budget. Relevant primitives:

- **ServiceExport / ServiceImport** — the export/import handshake for a service.
- **Lighthouse** — Submariner's DNS discovery:
  - *lighthouse-agent* watches `ServiceExport`/`ServiceImport` and syncs service
    metadata through the broker to all member clusters.
  - *lighthouse-coredns* answers `*.clusterset.local` queries from that synced data.
  - Cluster CoreDNS forwards the `clusterset.local` zone to lighthouse-coredns.
- **Broker** — a central sync point (lives on one cluster, typically the hub).

Discovery model:
- *Unique service in one cluster* (the MVP): export once, reachable everywhere as
  `<svc>.<ns>.svc.clusterset.local`.
- *Same service across clusters* (free stretch): Lighthouse aggregates same
  name+namespace exports into one `ServiceImport` and load-balances topology-aware
  (local cluster first, remote fallback). Target one cluster with
  `<cluster-id>.<svc>.<ns>.svc.clusterset.local`.

Cross-cluster aggregation matches by **service name + namespace** — they must match
across clusters for pattern 2.

## 4. Architecture

```
Author writes Package CR  (spec.network.expose[].multicluster: true)
        │
        ▼
uds-core operator (Pepr)
  ├─ Package reconciler  ── creates/deletes ──▶ Submariner ServiceExport
  └─ ClusterSet reconciler ── reads ──▶ Submariner Cluster / ServiceImport ──▶ ClusterSet .status
        │
        ▼
Submariner + Lighthouse  (deployed by uds-package-submariner; joined via subctl)
        │
        ▼
keycloak.keycloak.svc.clusterset.local  resolves + routes cross-cluster
```

Chosen approach: **thin operator**. The ClusterSet CR is descriptive (membership +
status). The operator does two narrow jobs — translate Package intent into
`ServiceExport`, and aggregate status. `subctl` handles broker deploy and cluster join
out-of-band. This keeps the reconciler small and puts the riskiest networking work in a
battle-tested tool instead of in 2-day-old code.

## 5. Components

### 5.1 ClusterSet CRD (uds-core)
- Group/version: `uds.dev/v1alpha1`, kind `ClusterSet`. Follows the existing
  `Package`/`Exemption`/`ClusterConfig` source pattern under
  `src/pepr/operator/crd/sources/`.
- Cluster-scoped (membership is a cluster-wide concept).

Spec (illustrative):
```yaml
apiVersion: uds.dev/v1alpha1
kind: ClusterSet
metadata:
  name: mission-edge
spec:
  provider: submariner        # only submariner for POC
  clusters:
    - name: hub
    - name: edge-1
```

Status (operator-populated, illustrative):
```yaml
status:
  clusters:
    - name: hub
      status: Ready           # derived from Submariner Cluster/Gateway health
      services: 3             # count of exported services originating here
    - name: edge-1
      status: Ready
      services: 1
  conditions: [...]
```

`status` is what the status command and dashboard render.

### 5.2 Package multicluster field (uds-core)
The existing `spec.network.expose[]` block is **Istio Gateway (north-south)** exposure.
Multicluster discovery is **east-west** and conceptually distinct. Decision: add a
multicluster marker that reuses the service+port already named in an expose entry, to
keep authors writing one familiar CR.

Field design (to be finalized in the package-mc-field spec — two candidates):
- **Option A:** `spec.network.expose[].multicluster: true` — least new surface, but
  overloads a north-south block with east-west meaning.
- **Option B:** new `spec.network.multicluster[]` list referencing `{ service, port,
  namespace }` — semantically clean, slightly more schema.

Recommendation captured for the spec: **Option B** if time allows (clean separation of
east-west from north-south), fall back to **Option A** for speed. Either way the
operator's output is the same: a Submariner `ServiceExport` for the named service.

### 5.3 Operator reconcilers (uds-core)
- **Package reconciler:** on Package create/update, for each multicluster-marked
  service, ensure a `ServiceExport` exists in the service's namespace; on
  removal/delete, delete the `ServiceExport`. Idempotent, owner-referenced for cleanup.
- **ClusterSet reconciler:** watch Submariner `Cluster` and `ServiceImport` (and
  `ServiceExport`) resources; compute and write ClusterSet `.status` (per-cluster
  readiness + exported service counts).

### 5.4 uds-package-submariner (new repo, Eng2)
- UDS/Zarf package wrapping submariner-operator + broker Helm charts.
- Tasks for broker token retrieval and gateway-node labeling.
- Keep thin: the package installs operator + broker on a cluster; per-cluster **join**
  is a `subctl join` step (token-dependent), not a declarative Zarf deploy.

### 5.5 Two-cluster dev environment (uds-core, Eng3)
- `tasks/multicluster.yaml`: stand up two k3d clusters with **non-overlapping pod and
  service CIDRs** (the main k3d/Submariner gotcha — `uds-k3d` defaults must be
  overridden per cluster), deploy UDS Core + uds-package-submariner to each, run broker
  on hub, `subctl join` edge, deploy the demo app.
- Goal: one command (or a short task sequence) brings up a reproducible, shareable
  two-cluster mesh for local test. k3d first (native to this repo); a different local
  cluster type for the final demo remains open.

### 5.6 CLI (stretch, uds-cli)
Thin `uds multicluster {init,join,status}` wrapper over `subctl` + the ClusterSet CR.
Out of MVP scope. `subctl` is the MVP interface.

## 6. Data flow (MVP demo path)

1. UDS Core + Submariner installed on hub and edge; broker on hub; edge joined via
   `subctl`. ClusterSet CR applied listing hub + edge-1.
2. Keycloak Package on hub marks its service multicluster.
3. uds-core Package reconciler creates `ServiceExport` for Keycloak on hub.
4. Lighthouse syncs the export through the broker; edge gets a `ServiceImport`.
5. Pod on edge resolves `keycloak.keycloak.svc.clusterset.local` via CoreDNS →
   lighthouse-coredns → hub Keycloak service IP.
6. `curl` from edge reaches hub Keycloak.
7. `subctl show` / ClusterSet `.status` / status command shows hub Ready (3 services),
   edge-1 Ready (1 service).

## 7. Repository structure and ownership

| Repo | Contents | Owner |
|---|---|---|
| `uds-core` (feature branch) | ClusterSet CRD, operator reconcilers, Package multicluster field, `tasks/multicluster.yaml`, demo bundle/app, specs | Eng1 (CRD/operator), Eng3 (env/demo) |
| `uds-package-submariner` (new) | Submariner operator + broker package, broker/join tasks, submariner-env spec | Eng2 |
| `uds-cli` (stretch) | Go `multicluster` wrapper | unassigned / stretch |

- Push access to `defenseunicorns/uds-core` confirmed: shared feature branch, per-engineer **git worktrees** to avoid collisions.
- Specs live in `docs/superpowers/specs/` committed to the branch so all engineers share them. One spec per piece: `clusterset-crd`, `package-mc-field`, `submariner-env`, `demo`.

## 8. Integration seam and risk management

The highest-risk dependency: Eng1's operator emits `ServiceExport` CRs that require
Eng2's Submariner CRDs present.

- **Mock the seam day-1 morning:** Eng2 hands Eng1 the `ServiceExport`/`ServiceImport`
  CRD YAML so Eng1 can build and unit-test the reconciler against the CRDs without a
  live mesh.
- Eng3's two-cluster env is the first place all three pieces meet for real.

Other risks:
- **k3d CIDR overlap** — two clusters must have distinct pod/service CIDRs or Submariner
  routing fails. Resolve in the submariner-env spec; verify early.
- **Gateway reachability** between k3d clusters on the local docker network.
- **uds-package-submariner scope creep** — resist making join declarative; `subctl`.

## 9. Testing and verification

- **Operator unit tests** (uds-core, vitest, existing pattern): Package with
  multicluster field → expected `ServiceExport`; removal → deletion; status
  aggregation from fixture Submariner CRs.
- **Integration (manual, scripted via task):** the Section 6 demo path end-to-end;
  success = `curl keycloak.<ns>.svc.clusterset.local` from edge returns Keycloak.
- **DNS validation:** resolve the `clusterset.local` hostname from an edge pod;
  `subctl show connections` / `subctl show services` green.

## 10. Success criteria

1. Two clusters connected (Submariner gateways up, `subctl show connections` healthy).
2. A service exported from hub via the Package multicluster field.
3. That service reachable and DNS-resolvable from edge at `*.clusterset.local`.
4. Workflow driven by UDS-native primitives (Package field + ClusterSet CR), not raw
   Submariner steps.
5. ClusterSet `.status` reflects per-cluster readiness and service counts.

## 11. Stretch goals

1. `uds multicluster {init,join,status}` CLI wrapper (uds-cli).
2. Pepr validation policy for ClusterSet / multicluster Package fields.
3. Connectivity / status dashboard (Eng3) rendering ClusterSet `.status`.
4. Same-service-across-clusters HA demo: export Keycloak from both clusters, kill hub,
   show edge still resolves locally.

## 12. Timeline (2 days)

**Day 1 AM** — ClusterSet CRD skeleton (Eng1); submariner-operator package installs +
broker on one cluster (Eng2); two-cluster k3d up with non-overlapping CIDRs (Eng3).
Eng2 hands ServiceExport CRD YAML to Eng1 (mock the seam).

**Day 1 PM** — Package reconciler emits ServiceExport (Eng1); edge joins broker, manual
ServiceExport resolves cross-cluster (Eng2); demo app deployed both clusters, env
documented + shareable (Eng3).

**Day 2 AM** — ClusterSet status aggregation (Eng1); DNS validation + stability (Eng2);
status command / dashboard reads status (Eng3).

**Day 2 PM** — Polish, end-to-end demo rehearsal, presentation. Stretch goals if ahead.

## 13. Future roadmap

Istio backend, Cilium backend, federated identity, cross-cluster package deployment,
traffic management, disaster recovery, fleet management, GitOps integration.
