# 7: Cluster-less CRD Generation Workflow

Date: 2026-01-13

## Status

Proposed

## Context

The current workflow for managing Custom Resource Definitions (CRDs) in `uds-core` (ClusterConfig, Package, Exemption) is cluster-dependent. TypeScript definitions in `src/pepr/operator/crd/sources/` are applied to a running Kubernetes cluster, and `kubernetes-fluent-client` then fetches the applied CRDs from the cluster to generate TypeScript types.

This workflow and the changes described in this ADR apply uniformly to all UDS Core CRDs, including ClusterConfig, Package, and Exemption.

This workflow presents several challenges:

1. **Cluster Dependency**: Generating TypeScript types requires a live Kubernetes cluster, preventing this task from running in standard CI/CD pipelines or for local development in cluster-less environments.
2. **Missing Static Manifests**: Authoritative YAML manifests for UDS Core CRDs are not checked into the repository. This hinders manual inspection, local validation, and the usage of Custom Resources (CRs) for resources that must exist before UDS Core is fully initialized (e.g., pre-core exemptions for MetalLB or other infrastructure components).
3. **Redundant Conversion Pipeline**: The current workflow effectively converts schemas from TypeScript to Kubernetes YAML (via the cluster) and then back into TypeScript types, adding complexity and increasing opportunities for drift.
4. **Synchronization Friction**: Keeping TS sources, the cluster's state, and the generated types in sync requires unnecessary runtime overhead and developer friction (requiring a running cluster for simple schema changes).

## Decision

We will transition to a cluster-less CRD generation workflow that preserves the benefits of TypeScript-based schema composition while enabling static manifest tracking and cluster-independent type generation. While TypeScript remains the authoring source of truth, the generated YAML manifests will be the primary checked-in artifact used for inspection and type generation.

Crucially, we will also move away from programmatic CRD registration within the Pepr operator. CRDs will be applied exclusively via **Helm charts** (e.g., during the UDS Core deployment process). This reduces the operator's runtime RBAC requirements and aligns with GitOps best practices.

We also intend to donate the manifest generation logic upstream to **kubernetes-fluent-client (KFC)** once established.

### Workflow Architecture

1. **Maintain TS Sources**: We will continue using `src/pepr/operator/crd/sources/*.ts` as the authoring source of truth for schema definitions, allowing us to leverage code reuse (e.g., shared Istio schema objects) and strong typing during design.
2. **Static Manifest Generation**: A new generation step will "compile" these TS sources into static YAML manifests located in `src/pepr/operator/crd/manifests/*.yaml`. These files will be tracked in Git.
3. **Local Type Generation**: The `gen-crds` task will be updated to point `kubernetes-fluent-client` at these local YAML files instead of a cluster.
4. **Helm-based Registration**: CRD registration will be removed from the Pepr operator's `register.ts` and moved into a Helm chart. This ensures that CRDs are managed as part of the standard deployment lifecycle.

## Consequences

### Positive

* **Improved Developer Velocity**: Instant type generation without the overhead of starting a local cluster.
* **CI/CD Enablement**: Enables automated validation of CRD changes and type-sync checks in GitHub Actions.
* **Improved Transparency**: CRD schema changes are now visible in PR diffs as both source code and final manifests.
* **Authoritative Artifacts**: Provides clear, static manifests for users to inspect or pre-apply in restricted environments.

### Negative

* **Artifact Bloat**: Checking in generated YAML manifests increases the repository size and diff complexity.
* **Desynchronization Risk**: Risk of developers updating TS sources without regenerating the manifests (mitigated by CI checks).

## Implementation Details

The implementation will focus on enhancing existing `uds-core` development patterns rather than introducing entirely new tooling paradigms.

1. **`gen-manifests` Script**: A TypeScript utility will be added to the `gen-crds` task in `src/pepr/tasks.yaml` to export TS schemas using the project's existing `js-yaml` dependency.
2. **`tasks.yaml` Refinement**: The existing `gen-crds` and `gen-manifests` tasks will be updated to remove cluster requirements. This maintains the current developer interface while changing the underlying implementation to be cluster-less.
3. **Tooling Integration**:

   * **Linting**: The new manifests in `src/pepr/operator/crd/manifests/` will be automatically covered by the existing `yamllint` pre-commit hook (configured in `.husky/pre-commit` and `.yamllint`).
   * **Licensing**: The generated YAML files will be processed by the existing `addlicense` logic in `tasks.yaml` to ensure compliance with project standards.
   * **Formatting**: `prettier` (via `lint-staged`) will continue to handle formatting for both the TS sources and the generated TS types.
4. **RBAC Reduction**: The Pepr operator's `register.ts` will be updated to remove CRD application logic. The operator's `ClusterRole` will be updated to remove `create`, `patch`, and `update` permissions for `customresourcedefinitions`, following the Principle of Least Privilege.
5. **KFC Upstreaming**: Once the internal `gen-manifests` script is stabilized, it will be proposed for inclusion in `kubernetes-fluent-client` to standardize this cluster-less workflow for the broader Pepr ecosystem.
6. **CI Synchronization**: An enhancement to the existing validation suite will be added to ensure `manifests/` stay in sync with `sources/`.

## Alternatives Considered

1. **Pure YAML Definitions**: Rejected because it loses the benefits of programmatic schema composition, reuse of shared objects and constants, and type-safe authoring available in TypeScript, which are central to how UDS Core evolves CRDs.
2. **JSON Schema Only**: Rejected because YAML manifests are the standard artifact for Kubernetes users and GitOps tools.
3. **Cluster Simulation (Kwok)**: Using a lightweight cluster simulation tool like **Kwok** was considered to speed up the existing cluster-dependent generation process. While this significantly reduces generation time (sub-2 seconds) compared to full clusters, it was rejected because it still requires an external binary dependency and does not fundamentally solve the "Missing Manifests" problem or the need for a runtime API during build steps. The chosen approach provides the same speed benefits without any external runtime requirements.

