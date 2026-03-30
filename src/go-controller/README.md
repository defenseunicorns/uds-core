# UDS Go Controller

A Go-based Kubernetes operator being built to replace the TypeScript [Pepr](../pepr/) operator. Reconciliation responsibilities are migrated one feature at a time using feature flags on the Pepr side.

## Structure

```
src/go-controller/
├── main.go                          # Wiring: clients, informers, startup
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

go build ./...
go vet ./...
```

> **Note:** Running `go build ./...` from the repo root will create a stray `pkg/` directory and build the wrong thing. Always `cd src/go-controller` first.

## Tasks

All tasks are run from the **repo root**:

```bash
# Regenerate raw CRD types into .generated/ (scratch — not a direct overwrite)
uds run -f src/go-controller/tasks.yaml gen-crds

# Build image, import to k3d, deploy manifests, and cycle the pod (used on an existing `dev-setup` cluster)
uds run -f src/go-controller/tasks.yaml update-controller

# Wait for the deployment to be ready
uds run -f src/go-controller/tasks.yaml validate
```

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
