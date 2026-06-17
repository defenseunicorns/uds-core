# UDS ClusterSet — Hackathon Working Doc

Human-facing quick reference for the 3-engineer multicluster hackathon. For the full
design see [`docs/superpowers/specs/2026-06-17-uds-clusterset-design.md`](docs/superpowers/specs/2026-06-17-uds-clusterset-design.md).

## What we're building

Cross-cluster service discovery that feels native to UDS. Mark a service multicluster
on its Package CR → it becomes resolvable from another cluster at
`<svc>.<ns>.svc.clusterset.local`. Submariner + Lighthouse do the networking/DNS; UDS
provides the ClusterSet CRD, the operator, and the experience.

Backend: Submariner. Env: two local k3d clusters. CLI: stretch (`subctl` for MVP).

## Ownership

| Engineer | Owns | Where |
|---|---|---|
| Eng1 | ClusterSet CRD, operator reconcilers, Package multicluster field | `uds-core` (this branch) |
| Eng2 | Submariner package, broker, join, ServiceExport/DNS validation | `uds-package-submariner` (new repo) |
| Eng3 | Two-cluster k3d env, demo app, status/dashboard, presentation | `uds-core` (this branch) |

## Task board

Status: ⬜ todo · 🟡 in progress · ✅ done

| # | Task | Owner | Spec § | Status |
|---|---|---|---|---|
| 1 | Shared branch `feat/clusterset` | — | §7 | ✅ |
| 2 | Two-cluster k3d env (`tasks/multicluster.yaml`), non-overlapping CIDRs | Eng3 | §5.5 | 🟡 |
| 3 | Submariner package: operator + broker | Eng2 | §5.4 | ⬜ |
| 4 | `subctl join` edge → mesh up | Eng2 | §6 | ⬜ |
| 5 | Hand ServiceExport/ServiceImport CRD yaml to Eng1 (mock seam) | Eng2 | §8 | ⬜ |
| 6 | ClusterSet CRD | Eng1 | §5.1 | ⬜ |
| 7 | Package multicluster field | Eng1 | §5.2 | ⬜ |
| 8 | Package reconciler → ServiceExport | Eng1 | §5.3 | ⬜ |
| 9 | ClusterSet status aggregation | Eng1 | §5.3 | ⬜ |
| 10 | Demo app (hub + edge), shareable env docs | Eng3 | §5.5 | ⬜ |
| 11 | End-to-end demo: `curl keycloak.<ns>.svc.clusterset.local` from edge | all | §6 | ⬜ |

Stretch: `uds multicluster` CLI · Pepr validation policy · connectivity dashboard · HA failover demo.

## Git worktrees — split without collisions

Shared base branch is `feat/clusterset`. Each engineer works in their own worktree on a
sub-branch, then merges/PRs back into `feat/clusterset`.

```bash
# from the main uds-core checkout, create a worktree + sub-branch off the shared base
git worktree add ../uds-core-crd     -b eng1/clusterset    feat/clusterset   # Eng1
git worktree add ../uds-core-env     -b eng3/multicluster  feat/clusterset   # Eng3

# list active worktrees
git worktree list

# integrate your work back into the shared base
git switch feat/clusterset
git merge eng1/clusterset

# remove a worktree when done (branch stays until deleted separately)
git worktree remove ../uds-core-crd
```

Each worktree is a full, independent checkout sharing one `.git` — no stepping on each
other's working tree. Rebase your sub-branch on `feat/clusterset` regularly to stay in sync.

## Working with the env (filled in as tasks land)

```bash
# bring up the two-cluster mesh   (task #2 — to be implemented)
uds run multicluster:up

# tear down
uds run multicluster:down

# check mesh health
subctl show connections
subctl show services
```

## Key references

- Design spec: `docs/superpowers/specs/2026-06-17-uds-clusterset-design.md`
- Implementation plans: `docs/superpowers/plans/` (added per piece)
- Submariner: ServiceExport/ServiceImport, Lighthouse DNS (`*.clusterset.local`)
- `subctl` is the MVP interface; the `uds multicluster` CLI is a stretch goal.
