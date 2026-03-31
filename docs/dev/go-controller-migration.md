# Go controller migration

UDS Core is migrating policy enforcement and operator logic from Pepr (TypeScript) to a native Go controller. This document explains the current architecture, the migration approach, and the developer workflow for contributing.

## Current architecture

Pepr is a TypeScript framework that compiles into a Kubernetes controller deployed as a pod in the `pepr-system` namespace. It serves two roles:

- **Admission webhooks (mutate and validate):** Pepr registers `MutatingAdmissionWebhook` and `ValidatingAdmissionWebhook` configurations with the API server. When a resource is created or updated, the API server sends an HTTP request to the Pepr pod, which runs `.Mutate()` and `.Validate()` callbacks synchronously before the resource is persisted.
- **Watch and reconcile loops:** Pepr opens long-lived watch streams against the API server (similar to Go informers) and invokes callbacks when events arrive. This handles asynchronous controller logic like reconciling `UDSPackage` CRDs into Istio VirtualServices, NetworkPolicies, and Keycloak clients.

The entry point is `pepr.ts`, which registers four capabilities:

| Capability | Source | Role |
|---|---|---|
| `operator` | `src/pepr/operator/` | CRD reconcilers, Istio config, Keycloak SSO, network policies, CA bundles |
| `policies` | `src/pepr/policies/` | Security policies via admission webhooks (privilege escalation, root user, capabilities, seccomp, SELinux, storage, networking) |
| `prometheus` | `src/pepr/prometheus/` | Prometheus monitoring patches |
| `patches` | `src/pepr/patches/` | Component-specific patches |

### Policies vs operator logic

Policies (`src/pepr/policies/`) run as admission webhooks. They intercept Pod creation and either mutate the spec (e.g., set `drop: ["ALL"]` on capabilities) or reject the request (e.g., deny privilege escalation). Each policy is a `When(a.Pod).IsCreatedOrUpdated().Mutate(...).Validate(...)` block.

Operator logic (`src/pepr/operator/`) uses a mix of admission webhooks and reconcile loops. It watches `UDSPackage`, `UDSExemption`, and `ClusterConfig` CRDs, and creates derived Kubernetes and Istio resources.

## Go controller overview

The Go controller lives in `src/go-controller/` and deploys as a separate Deployment in the `uds-system` namespace. It runs alongside Pepr during the migration period. Both controllers talk to the same API server and can coexist because they handle different resources or webhook paths.

The controller uses `k8s.io/client-go` with `dynamic/dynamicinformer` for watch/reconcile logic (Package CR, ClusterConfig). For admission webhooks, it runs an HTTPS server on port 9443 with self-signed TLS certificates generated at startup, and registers `ValidatingWebhookConfiguration` resources. The first webhook protects the ClusterConfig singleton from deletion.

## Test infrastructure

Two layers of tests exist for policies, and both are reusable during migration.

### Unit tests

Location: `src/pepr/policies/security.spec.ts`, `networking.spec.ts`, `storage.spec.ts`, `istio.spec.ts`

These test pure validation and mutation functions in isolation (e.g., `validatePrivilegeEscalation`, `setPrivilegeEscalation`, `validateSeccompProfile`). They don't require a cluster.

Use these as your **specification** when writing equivalent Go unit tests. The test cases, inputs, and expected outputs map directly to what the Go implementations should produce.

### Integration tests

Location: `test/vitest/pepr-policies/security.spec.ts`

These run against a live cluster. They create Pods via the Kubernetes API and assert that the admission webhook rejects or mutates them correctly. They use the Pepr SDK for API calls, but the assertions check HTTP responses from the API server, making them framework-agnostic.

**These tests validate the Go implementation without modification.** They don't care whether Pepr or Go handles the admission request. The one thing to watch for is error message strings: the integration tests match on specific Pepr-formatted messages (e.g., `"Privilege escalation is disallowed. Authorized: [allowPrivilegeEscalation = false | privileged = false]"`). Your Go webhook must return matching messages, or you must update the expected strings.

## Migrating a policy

Follow these steps to move a policy from Pepr to Go.

### 1. Implement the policy in Go

Add your webhook handler in `src/go-controller/webhook/`. The webhook infrastructure is already in place:

- **HTTPS server with TLS:** `webhook/server.go` generates a self-signed ECDSA P-256 certificate at startup and patches the `caBundle` into the `ValidatingWebhookConfiguration` via the Kubernetes API. No cert-manager or external cert generation needed.
- **Handler pattern:** Add a new handler function in `webhook/handler.go` (or a new file), register its path in `server.go`'s `StartWebhookServer` function, and add corresponding rules to the `ValidatingWebhookConfiguration` (or create a `MutatingWebhookConfiguration` if the policy mutates) in both `chart/templates/webhook.yaml` and `manifests/webhook.yaml`.
- **RBAC:** If your webhook configuration uses a new resource name, add it to the `admissionregistration.k8s.io` rule in `chart/templates/rbac.yaml` and `manifests/rbac.yaml`.

Write Go unit tests that cover the same cases as the corresponding `src/pepr/policies/*.spec.ts` file. See `webhook/handler_test.go` for the existing test pattern using `httptest`.

### 2. Disable the policy in Pepr

In the relevant file under `src/pepr/policies/` (e.g., `security.ts`), remove the `When(a.Pod).IsCreatedOrUpdated().Mutate(...).Validate(...)` block for the policy you migrated. Then rebuild Pepr with `npx pepr build`.

### 3. Verify with integration tests

Run the integration tests against your cluster to confirm the Go webhook handles requests correctly:

```bash
npx vitest run test/vitest/pepr-policies/security.spec.ts
```

## Developer workflow

### Initial setup

Create a k3d dev cluster with the Go controller deployed:

```bash
uds run dev-setup
```

This creates namespaces, builds and loads the Go controller image into k3d, deploys it, installs CRDs, and deploys Istio.

### Rebuild and redeploy the Go controller

After making changes to Go code:

```bash
uds run redeploy-go-controller
```

This rebuilds the Docker image, loads it into k3d, reapplies manifests, and restarts the deployment.

### Run Pepr in dev mode

To test Pepr alongside the Go controller:

```bash
npx pepr dev
```

Or deploy the built Pepr module:

```bash
npx pepr deploy
```

### Run tests

Run Go unit tests:

```bash
cd src/go-controller && go test ./...
```

Run the Go controller integration tests against the cluster:

```bash
cd test/vitest && npm ci && npx vitest run go-controller.spec.ts
```

Run the policy integration tests against the cluster:

```bash
cd test/vitest && npx vitest run pepr-policies/security.spec.ts
```

## Recommended migration order

Start with **validate-only policies** (no mutation) to avoid needing a `MutatingWebhookConfiguration` initially:

1. `RestrictProcMount` or `DisallowSELinuxOptions`: simple approve/deny logic
2. `RestrictSeccomp`, `RestrictSELinuxType`: similar pattern, slightly more cases
3. `DisallowPrivileged`, `RequireNonRootUser`: these also mutate, so add `MutatingWebhookConfiguration`
4. `DropAllCapabilities`, `RestrictCapabilities`: mutation + validation

The webhook plumbing (TLS, HTTPS server, caBundle patching) is already in place from the ClusterConfig deletion protection webhook. Adding more policies is incremental — write the handler, register the path, add the webhook configuration rules.

After all policies are migrated, move to operator reconcile logic. The Package CR reconciler and ClusterConfig controller are already implemented using `dynamic/dynamicinformer`, which maps directly to Pepr's `.Reconcile()` and `.Watch()` patterns.
