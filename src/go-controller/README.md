# UDS Go Controller

A Go-based Kubernetes operator being built to replace the TypeScript [Pepr](../pepr/) operator. Reconciliation responsibilities are migrated one feature at a time using feature flags on the Pepr side.

See [status.md](./status.md) for a current snapshot of what has moved to Go vs. what remains in Pepr.

## Structure

```
src/go-controller/
├── main.go                          # Wiring: clients, informers, startup
├── dev-flags.env                    # Feature flag toggles for local dev (see below)
...
├── api/uds/v1alpha1/                # Go types for UDS CRDs along with helpers and registration logic used for client generation
├── client/                          # Generated typed clients (do not edit by hand)
├── hack/                            # Code generation scripts and tooling
├── internal/
│   ├── config/
│   │   └── config.go                # In-memory cluster config singleton (mirrors Pepr's UDSConfig)
│   ├── featureflags/
│   │   └── flags.go                 # Reads UDS_OPERATOR_*_ENABLED env vars; true when Go owns a phase
│   ├── resources/
│   │   └── resources.go             # Server-side apply + orphan purge helpers
│   ├── store/
│   │   └── waypoint.go              # In-memory per-namespace waypoint store (used by webhook)
│   ├── utils/
│   │   └── utils.go                 # Shared helpers (name sanitization, owner refs, etc.)
│   └── controller/
│       ├── controller.go            # Shared controller wiring / base types
│       ├── udspackage/              # UDSPackageController — watches UDSPackage CRs
│       ├── clusterconfig/           # ClusterConfigController — watches ClusterConfig, populates config
│       ├── authpolicy/              # Authorization policy reconciliation
│       ├── cabundle/                # CA bundle ConfigMap reconciliation
│       ├── istio/                   # Istio-related (ingress, egress, injection) reconciliation
│       ├── monitoring/              # PodMonitor / ServiceMonitor reconciliation
│       ├── network/                 # NetworkPolicy reconciliation
│       ├── probes/                  # Uptime probe reconciliation
│       └── sso/                     # Keycloak client and AuthService chain reconciliation
├── webhook/                         # Mutating admission webhook
├── manifests/                       # Raw Kubernetes manifests (for dev iteration)
└── chart/                           # Helm chart for production deployment
```

## Building

All Go commands must be run from this directory:

```bash
cd src/go-controller

go build -o controller .
go vet ./...
```

> **Note:** Running `go build ./...` from the repo root will create a stray `pkg/` directory and build the wrong thing. Always `cd src/go-controller` first.

## Dev Setup

> **Prerequisites:** `uds`, `k3d`, `docker`, `npx` available on PATH.

### First time

```bash
# 1. Spin up k3d cluster with Istio and UDS CRDs
uds run dev-setup

# 2. Deploy Pepr (first time only — builds and applies the Pepr module)
npx pepr deploy --yes
```

If the above fails with `Cannot find package...` run `npm install` in the repo root directory.

### Iterating on Go controller code

```bash
uds run -f src/go-controller/tasks.yaml update-controller
```

Rebuilds the image, imports it into k3d, and cycles the deployment.

### Generating clients (only if you made changes to api/)

```bash
cd src/go-controller
uds run gen-clients
```

Regenerates all client code that lives under `client/`.

### Changing feature flags (shifting a controller from Pepr → Go)

1. Edit `src/go-controller/dev-flags.env` — set the relevant flag to `false`
2. Apply to the running Pepr watcher:

```bash
uds run -f src/go-controller/tasks.yaml update-pepr
```

3. If you also updated Go controller code, run `update-controller` too.

### All tasks (run from repo root)

```bash
# Spin up first-time cluster + CRDs
uds run dev-setup

# Deploy/redeploy Go controller
uds run -f src/go-controller/tasks.yaml update-controller

# Apply dev-flags.env to Pepr watcher and restart it
uds run -f src/go-controller/tasks.yaml update-pepr

# Wait for Go controller deployment to be ready
uds run -f src/go-controller/tasks.yaml validate

# Regenerate raw CRD types into .generated/ (scratch — not a direct overwrite)
uds run -f src/go-controller/tasks.yaml gen-crds
```

## Feature Flags

`dev-flags.env` controls which reconcile phases Pepr handles vs. the Go controller. Each flag defaults to `true` (Pepr handles it). Setting a flag to `false` disables that phase in Pepr, handing responsibility to the Go controller.

| Flag | Pepr phase disabled when `false` |
|---|---|
| `UDS_OPERATOR_NETWORK_POLICIES_ENABLED` | `networkPolicies` |
| `UDS_OPERATOR_AUTHORIZATION_POLICIES_ENABLED` | `generateAuthorizationPolicies` |
| `UDS_OPERATOR_ISTIO_INJECTION_ENABLED` | `enableIstio` |
| `UDS_OPERATOR_ISTIO_INGRESS_ENABLED` | `istioResources` |
| `UDS_OPERATOR_ISTIO_EGRESS_ENABLED` | `istioEgressResources` |
| `UDS_OPERATOR_SSO_ENABLED` | `keycloak` + `authservice` + `purgeSSOClients` |
| `UDS_OPERATOR_POD_MONITORS_ENABLED` | `podMonitor` |
| `UDS_OPERATOR_SERVICE_MONITORS_ENABLED` | `serviceMonitor` |
| `UDS_OPERATOR_UPTIME_PROBES_ENABLED` | `probe` |
| `UDS_OPERATOR_CA_BUNDLE_ENABLED` | `caBundleConfigMap` |

### Migrating a phase to Go

1. Implement the phase in `PackageController.syncHandler()` (`internal/controller/udspackage/udspackage.go`)
2. Set its flag to `false` in `dev-flags.env`
3. Run `update-pepr` and `update-controller` to disable on Pepr and enable on Go
4. Apply a Package CR and verify the phase runs in Go logs and is absent from Pepr watcher logs
5. Commit — `dev-flags.env` is the living record of what Go currently owns

## CRD Type Generation

Types are generated from the CRD YAML manifests using `kubernetes-fluent-client`:

```bash
uds run -f src/go-controller/tasks.yaml gen-crds
```

Output goes to `.generated/` (gitignored) for developer reference only — it is **not** a direct overwrite of the curated types. The generated output requires manual fixups before it can be used:

- Add `package v1alpha1` declaration
- Move any mid-file `import` statements to the top
- Add `metav1.TypeMeta` + `metav1.ObjectMeta` to the top-level CR struct
- Add a `*List` struct with `metav1.ListMeta`
- Rename duplicate/generic type names (e.g. `PurpleMethod` → `StringMatch`)

When a CRD changes: run `gen-crds`, diff `.generated/<crd>-v1alpha1.go` against `api/uds/v1alpha1/<crd>.go`, and manually incorporate relevant changes.

## In-Memory Config

`internal/config/config.go` holds a thread-safe singleton (`Get()` / `Update()`) populated by the `ClusterConfigController` when the `uds-cluster-config` CR is created or updated. This mirrors Pepr's `UDSConfig` global in `src/pepr/operator/controllers/config/config.ts`.

Controllers that need cluster config (domain, CA bundle, network CIDRs, etc.) call `config.Get()`.

## Webhooks

The webhook server (`webhook/`) handles admission requests for:

| Path | Type | Purpose |
|------|------|---------|
| `/validate-pods` | Validating | Enforces non-root user requirements (example security policy) |
| `/mutate-pods` | Mutating | Injects safe security context defaults |
| `/mutate-pod-waypoint` | Mutating | Labels pods for ambient waypoint routing |
| `/mutate-service-waypoint` | Mutating | Labels services for ambient waypoint routing |
| `/validate-clusterconfig-delete` | Validating | Blocks deletion of the ClusterConfig CR |

The pod/service waypoint webhooks are active when `UDS_OPERATOR_SSO_ENABLED=false` (i.e., Go owns SSO). Pepr's equivalent waypoint mutations are gated by the same flag and disabled in that case.

## Controller Pattern

Each CRD gets its own controller file in `internal/controller/`. Controllers follow this pattern:

- `Reconcile(ctx, obj)` — the business logic; called for both add and update events
- `HandleAdd` / `HandleUpdate` — thin event handlers that call `Reconcile`
- `HandleDelete` — separate from reconcile; handles owned-resource cleanup (omitted where deletion is not expected, e.g. ClusterConfig)
- A private `parse<Kind>(obj)` function that converts the dynamic informer's `*unstructured.Unstructured` to a typed struct via JSON marshal/unmarshal

Skip guards in `shouldSkip` mirror Pepr's logic:
1. First time the UID is seen — always process (bootstraps new packages regardless of generation)
2. If `status.phase == Retrying` — always process (error recovery overrides the generation check)
3. If `status.phase == Removing` or `RemovalFailed`, or `DeletionTimestamp` is set — skip (routed to `handleFinalizer` instead)
4. If `status.phase == Pending` — skip (guards against re-entrant loops while status is being patched)
5. If `status.observedGeneration == metadata.generation` — skip (already processed this version)
