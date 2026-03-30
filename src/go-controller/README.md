# UDS Go Controller

A Go-based Kubernetes operator being built to replace the TypeScript [Pepr](../pepr/) operator. Reconciliation responsibilities are migrated one feature at a time using feature flags on the Pepr side.

## Structure

```
src/go-controller/
├── main.go                          # Wiring: clients, informers, startup
├── dev-flags.env                    # Feature flag toggles for local dev (see below)
├── api/uds/v1alpha1/                # Go types for UDS CRDs
│   ├── package.go                   # Package CR types (generated + curated)
│   └── clusterconfig.go             # ClusterConfig CR types (hand-written)
├── internal/
│   ├── config/
│   │   └── config.go                # In-memory cluster config singleton (mirrors Pepr's UDSConfig)
│   └── controller/
│       ├── package.go               # PackageController — watches Package CRs
│       └── clusterconfig.go         # ClusterConfigController — watches ClusterConfig, populates config
├── manifests/                       # Raw Kubernetes manifests (for dev iteration)
│   ├── deployment.yaml
│   ├── namespace.yaml
│   └── rbac.yaml
├── chart/                           # Helm chart for production deployment
└── tasks.yaml                       # UDS task definitions (see below)
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

### Iterating on Go controller code

```bash
uds run -f src/go-controller/tasks.yaml update-controller
```

Rebuilds the image, imports it into k3d, and cycles the deployment.

### Generating clients (only if you made changes to api/)

```bash
cd src/go-controller
uds run  gen-clients
```

Regenerates all client code that lives under `clients/`.

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

1. Implement the phase in `PackageController.Reconcile()` (`internal/controller/package.go`)
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

## Controller Pattern

Each CRD gets its own controller file in `internal/controller/`. Controllers follow this pattern:

- `Reconcile(ctx, obj)` — the business logic; called for both add and update events
- `HandleAdd` / `HandleUpdate` — thin event handlers that call `Reconcile`
- `HandleDelete` — separate from reconcile; handles owned-resource cleanup (omitted where deletion is not expected, e.g. ClusterConfig)
- A private `parse<Kind>(obj)` function that converts the dynamic informer's `*unstructured.Unstructured` to a typed struct via JSON marshal/unmarshal

Skip guards in `Reconcile` mirror Pepr's `shouldSkip` logic:
1. If `status.phase == Pending` — skip (guards against infinite loops when status is patched)
2. If `status.observedGeneration == metadata.generation` — skip (already processed this version)
