# UDS ClusterSet — Hackathon Working Doc

Human-facing quick reference for the multicluster hackathon. For the full
design see [`docs/superpowers/specs/2026-06-17-uds-clusterset-design.md`](docs/superpowers/specs/2026-06-17-uds-clusterset-design.md).

## What we're building

Cross-cluster service discovery that feels native to UDS. Mark a service multicluster
on its Package CR → it becomes resolvable from another cluster at
`<svc>.<ns>.svc.clusterset.local`. Submariner + Lighthouse do the networking/DNS; UDS
provides the ClusterSet CRD, the operator, and the experience.

Backend: Submariner. Env: two local k3d clusters. CLI: stretch (`subctl` for MVP).

## Working with the env

The two-cluster k3d mesh — our main working tool for local dev and test.

```bash
# bring up the two-cluster mesh (hub + edge, non-overlapping CIDRs)
uds run -f tasks/multicluster.yaml up

# verify CIDRs distinct + cross-cluster node reachability
uds run -f tasks/multicluster.yaml verify

# tear down
uds run -f tasks/multicluster.yaml down

# mesh health (after Submariner is joined — Chance)
subctl show connections
subctl show services
```

Contexts: `k3d-hub`, `k3d-edge`. Shared docker network: `clusterset`.
CIDRs — hub: pod 10.42/16 svc 10.43/16 · edge: pod 10.44/16 svc 10.45/16.

## Ownership

| # | Engineer | Owns | Where |
|---|---|---|---|
| Eng1 | **Brian** | ClusterSet CRD, operator reconcilers, Package multicluster field | `uds-core` (this branch) |
| Eng2 | **Chance** | Submariner package, broker, join, ServiceExport/DNS validation | `uds-package-submariner` (new repo) |
| Eng3 | **Joel** _(limited capacity)_ | Two-cluster k3d env, demo app, status/dashboard, presentation | `uds-core` (this branch) |

## Task board

Status: ⬜ todo · 🟡 in progress · ✅ done

| # | Task | Owner | Spec § | Status |
|---|---|---|---|---|
| 1 | Shared branch `feat/clusterset` | — | §7 | ✅ |
| 2 | Two-cluster k3d env (`tasks/multicluster.yaml`), non-overlapping CIDRs | Joel | §5.5 | ✅ |
| 3 | Submariner package: operator + broker | Chance | §5.4 | ⬜ |
| 4 | `subctl join` edge → mesh up | Chance | §6 | ⬜ |
| 5 | Hand ServiceExport/ServiceImport CRD yaml to Brian (mock seam) | Chance | §8 | ⬜ |
| 6 | ClusterSet CRD | Brian | §5.1 | ✅ |
| 7 | Package multicluster field | Brian | §5.2 | ⬜ |
| 8 | Package reconciler → ServiceExport | Brian | §5.3 | ⬜ |
| 9 | ClusterSet status aggregation | Brian | §5.3 | ⬜ |
| 10 | Demo app (hub + edge), shareable env docs | Joel | §5.5 | ⬜ |
| 11 | End-to-end demo: `curl keycloak.<ns>.svc.clusterset.local` from edge | all | §6 | ⬜ |

Stretch: `uds multicluster` CLI · Pepr validation policy · connectivity dashboard · HA failover demo.

## Worktrunk — split without collisions

We use [worktrunk](https://worktrunk.dev) (`wt`) for worktrees. Shared base branch is
`feat/clusterset`. Each engineer works in their own worktree on a sub-branch, then
merges back into `feat/clusterset`.

```bash
# create a worktree on a new sub-branch off the shared base
wt switch --create brian/clusterset   --base feat/clusterset   # Brian
wt switch --create joel/multicluster  --base feat/clusterset   # Joel

# list worktrees + status
wt list

# move between worktrees
wt switch brian/clusterset
wt switch -        # previous worktree
wt switch ^        # default branch worktree

# merge your branch back into the shared base
wt merge feat/clusterset
```

Each worktree is a full, independent checkout sharing one `.git` — no stepping on each
other's working tree. Keep your sub-branch current with `feat/clusterset`.

## Key references

- Design spec: `docs/superpowers/specs/2026-06-17-uds-clusterset-design.md`
- Implementation plans: `docs/superpowers/plans/` (added per piece)
- Submariner: ServiceExport/ServiceImport, Lighthouse DNS (`*.clusterset.local`)
- `subctl` is the MVP interface; the `uds multicluster` CLI is a stretch goal.
