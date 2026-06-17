# ClusterSet CRD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cluster-scoped `ClusterSet` CRD (`uds.dev/v1alpha1`) to the UDS Core Pepr operator, registered through the existing CRD-generation pipeline, with a minimal reconciler that marks a ClusterSet `Ready`.

**Architecture:** Mirror the `ClusterConfig` cluster-scoped CRD pattern exactly. The source-of-truth is `src/pepr/operator/crd/sources/cluster-set/v1alpha1.ts`; the `gen-crds` task generates the installable YAML template, the typed TS class (via `kubernetes-fluent-client`), the JSON schema, and docs. A reconciler watches the CRD and patches its status. Service-export logic, the Package multicluster field, and status aggregation are SEPARATE later plans — this plan only makes ClusterSet exist and reconcile to `Ready`.

**Tech Stack:** TypeScript, Pepr 1.2.1, kubernetes-fluent-client 3.11.7, vitest, maru tasks (`uds run`).

**Scope note:** A validating webhook is explicitly a hackathon stretch goal (design §11 #2) and is OMITTED here (YAGNI). Status aggregation (per-cluster service counts) is Task 9 of the design / a later plan; this plan defines the status *schema* but only sets `phase`/`observedGeneration`.

---

## File structure

- Create: `src/pepr/operator/crd/sources/cluster-set/v1alpha1.ts` — CRD version definition (spec/status schema, printer columns). Source of truth.
- Modify: `src/pepr/scripts/gen-crds.ts` — add the ClusterSet manifest wrapper + write its YAML.
- Modify: `src/pepr/tasks.yaml` — add kfc TS-type + JSON-schema generation steps for `clustersets.uds.dev`; add it to the gen-docs `CRD_LIST`.
- Generated (by the task, do NOT hand-edit): `src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml`, `src/pepr/operator/crd/generated/clusterset-v1alpha1.ts`, `schemas/clusterset-v1alpha1.schema.json`, docs.
- Modify: `src/pepr/operator/crd/index.ts` — re-export the generated `ClusterSet` types.
- Create: `src/pepr/operator/reconcilers/clusterset-reconciler.ts` — minimal reconciler (own status patch; does NOT reuse the Package-typed helpers in `reconcilers/index.ts`).
- Create: `src/pepr/operator/reconcilers/clusterset-reconciler.spec.ts` — vitest unit tests.
- Modify: `src/pepr/operator/index.ts` — register `When(ClusterSet).IsCreatedOrUpdated().Reconcile(...)`.

---

### Task 1: ClusterSet source definition

**Files:**
- Create: `src/pepr/operator/crd/sources/cluster-set/v1alpha1.ts`

- [ ] **Step 1: Write the source definition**

```typescript
/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1CustomResourceDefinitionVersion, V1JSONSchemaProps } from "@kubernetes/client-node";

export const v1alpha1: V1CustomResourceDefinitionVersion = {
  name: "v1alpha1",
  served: true,
  storage: true,
  additionalPrinterColumns: [
    {
      name: "Provider",
      type: "string",
      description: "The multicluster backend provider",
      jsonPath: ".spec.provider",
    },
    {
      name: "Status",
      type: "string",
      description: "The status of the cluster set",
      jsonPath: ".status.phase",
    },
    {
      name: "Age",
      type: "date",
      description: "The age of the cluster set",
      jsonPath: ".metadata.creationTimestamp",
    },
  ],
  subresources: {
    status: {},
  },
  schema: {
    openAPIV3Schema: {
      type: "object",
      properties: {
        spec: {
          type: "object",
          required: ["clusters"],
          properties: {
            provider: {
              type: "string",
              description: "The multicluster backend provider",
              enum: ["submariner"],
              default: "submariner",
            },
            clusters: {
              type: "array",
              description: "Member clusters in this set",
              items: {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the member cluster",
                  },
                },
              },
            },
          },
        } as V1JSONSchemaProps,
        status: {
          type: "object",
          properties: {
            observedGeneration: {
              type: "integer",
            },
            phase: {
              enum: ["Pending", "Ready", "Failed"],
              type: "string",
            },
            clusters: {
              type: "array",
              description: "Per-cluster status (populated by status aggregation)",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  status: { type: "string" },
                  services: { type: "integer" },
                },
              },
            },
          },
        } as V1JSONSchemaProps,
      },
      required: ["spec"],
    },
  },
};
```

- [ ] **Step 2: Verify it compiles (typecheck the file)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `cluster-set/v1alpha1.ts`. (Pre-existing unrelated errors, if any, are out of scope — confirm none mention the new file.)

- [ ] **Step 3: Stage (do NOT commit — repo owner commits)**

```bash
git add src/pepr/operator/crd/sources/cluster-set/v1alpha1.ts
```

---

### Task 2: Wire ClusterSet into the YAML generator

**Files:**
- Modify: `src/pepr/scripts/gen-crds.ts`

- [ ] **Step 1: Add the import** (after the existing source imports, around line 12)

```typescript
import { v1alpha1 as clusterSet } from "../operator/crd/sources/cluster-set/v1alpha1";
```

- [ ] **Step 2: Add the manifest** (after the `clusterConfigManifest` block)

```typescript
// ClusterSet CRD
const clusterSetManifest = {
  apiVersion: "apiextensions.k8s.io/v1",
  kind: "CustomResourceDefinition",
  metadata: { name: "clustersets.uds.dev" },
  spec: {
    group: "uds.dev",
    scope: "Cluster",
    names: {
      plural: "clustersets",
      singular: "clusterset",
      kind: "ClusterSet",
      listKind: "ClusterSetList",
    },
    versions: [clusterSet],
  },
};
```

- [ ] **Step 3: Write the YAML** (add next to the other `writeYamlToDir` calls)

```typescript
writeYamlToDir("clustersets.uds.dev.yaml", clusterSetManifest);
```

- [ ] **Step 4: Stage**

```bash
git add src/pepr/scripts/gen-crds.ts
```

---

### Task 3: Wire ClusterSet into the gen-crds task

**Files:**
- Modify: `src/pepr/tasks.yaml`

- [ ] **Step 1: Add kfc type + schema generation steps**

In the `gen-crds` task, after the `clusterconfig.uds.dev` JSON-schema step (the block ending with the `.definitions.ClusterConfig.additionalProperties` yq line), insert two new actions:

```yaml
      - cmd: |
          # renovate: datasource=github-tags depName=defenseunicorns/kubernetes-fluent-client versioning=semver
          npx kubernetes-fluent-client@3.11.7 crd src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml src/pepr/operator/crd/generated
        description: "Generate TS types for clustersets.uds.dev"

      - cmd: |
          # renovate: datasource=github-tags depName=defenseunicorns/kubernetes-fluent-client versioning=semver
          npx kubernetes-fluent-client@3.11.7 crd src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml -l json-schema schemas
          # Move the schema files to a standard path
          mv schemas/clusterset-v1alpha1.json-schema schemas/clusterset-v1alpha1.schema.json
          # Make the schema strict on additionalProperties
          uds zarf tools yq -i '(.. | select(has("additionalProperties") and .additionalProperties | select(length==0))) |= .additionalProperties = false' schemas/clusterset-v1alpha1.schema.json
          uds zarf tools yq -i '.definitions.ClusterSet.additionalProperties = {}' schemas/clusterset-v1alpha1.schema.json
        description: "Generate JSON schema for clustersets.uds.dev"
```

- [ ] **Step 2: Add the CRD to gen-docs**

In the `gen-docs` task, change the `CRD_LIST` line to include the new CRD:

```yaml
          CRD_LIST="exemptions.uds.dev packages.uds.dev clusterconfig.uds.dev clustersets.uds.dev"
```

- [ ] **Step 3: Stage**

```bash
git add src/pepr/tasks.yaml
```

---

### Task 4: Run the generator and verify outputs

**Files:**
- Generated: `src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml`, `src/pepr/operator/crd/generated/clusterset-v1alpha1.ts`, `schemas/clusterset-v1alpha1.schema.json`

- [ ] **Step 1: Run the gen-crds task**

Run: `uds run -f src/pepr/tasks.yaml gen-crds`
Expected: completes without error; prints "CRD YAMLs generated." Note: this task also runs `addlicense` (requires `$HOME/go/bin/addlicense`) and `npx pepr format`. If `addlicense` is missing, install it or run the kfc steps individually — report which.

- [ ] **Step 2: Verify the YAML template was generated with Cluster scope**

Run: `uds zarf tools kubectl apply --dry-run=client -f src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml`
Expected: `customresourcedefinition.apiextensions.k8s.io/clustersets.uds.dev created (dry run)`. Confirm the file contains `scope: Cluster` and `kind: ClusterSet`.

- [ ] **Step 3: Verify the typed class was generated**

Run: `grep -n "RegisterKind" src/pepr/operator/crd/generated/clusterset-v1alpha1.ts`
Expected: a `RegisterKind(ClusterSet, { group: "uds.dev", version: "v1alpha1", kind: "ClusterSet", plural: "clustersets" })` block exists, plus exported `ClusterSet` class and `Spec`/`Status` interfaces.

- [ ] **Step 4: Stage generated files**

```bash
git add src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml src/pepr/operator/crd/generated/clusterset-v1alpha1.ts schemas/clusterset-v1alpha1.schema.json
git add docs
```

---

### Task 5: Export ClusterSet from the CRD index

**Files:**
- Modify: `src/pepr/operator/crd/index.ts`

- [ ] **Step 1: Add the export**

After the `clusterconfig-v1alpha1` export block (around line 44), add (adjust the named members to match what was actually generated in Task 4 — confirm the enum/interface names in `generated/clusterset-v1alpha1.ts`):

```typescript
export {
  ClusterSet,
  Phase as ClusterSetPhase,
} from "./generated/clusterset-v1alpha1";
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `crd/index.ts` or the ClusterSet export.

- [ ] **Step 3: Stage**

```bash
git add src/pepr/operator/crd/index.ts
```

---

### Task 6: Minimal reconciler (TDD)

The shared helpers in `reconcilers/index.ts` (`shouldSkip`, `updateStatus`, `handleFailure`) are typed to `UDSPackage` and call `K8s(UDSPackage).PatchStatus` — they are NOT reusable here. Write a small self-contained reconciler that patches the ClusterSet's own status.

**Files:**
- Create: `src/pepr/operator/reconcilers/clusterset-reconciler.ts`
- Test: `src/pepr/operator/reconcilers/clusterset-reconciler.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

const patchStatus = vi.fn();
vi.mock("pepr", () => ({
  K8s: vi.fn(() => ({ PatchStatus: patchStatus })),
}));

import { clusterSetReconciler } from "./clusterset-reconciler";
import { ClusterSet } from "../crd";

describe("ClusterSet reconciler", () => {
  beforeEach(() => vi.clearAllMocks());

  test("patches status to Ready with observedGeneration", async () => {
    const cs = {
      apiVersion: "uds.dev/v1alpha1",
      kind: "ClusterSet",
      metadata: { name: "mission-edge", generation: 3, uid: "abc" },
      spec: { provider: "submariner", clusters: [{ name: "hub" }, { name: "edge-1" }] },
    } as ClusterSet;

    await clusterSetReconciler(cs);

    expect(patchStatus).toHaveBeenCalledTimes(1);
    const arg = patchStatus.mock.calls[0][0];
    expect(arg.metadata.name).toBe("mission-edge");
    expect(arg.status.phase).toBe("Ready");
    expect(arg.status.observedGeneration).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pepr/operator/reconcilers/clusterset-reconciler.spec.ts`
Expected: FAIL — cannot find module `./clusterset-reconciler` (not created yet).

- [ ] **Step 3: Write the minimal reconciler**

```typescript
/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { Component, setupLogger } from "../../logger";
import { ClusterSet } from "../crd";

const log = setupLogger(Component.OPERATOR_RECONCILERS);

/**
 * Reconciles a ClusterSet by marking it Ready.
 *
 * NOTE: this is the minimal lifecycle reconciler. Per-cluster status
 * aggregation (service counts, member readiness) is a later task.
 *
 * @param cs the ClusterSet to reconcile
 */
export async function clusterSetReconciler(cs: ClusterSet) {
  const name = cs.metadata!.name;
  log.info(`Processing ClusterSet ${name}, phase: ${cs.status?.phase}`);

  await K8s(ClusterSet).PatchStatus({
    metadata: { name },
    status: {
      phase: "Ready",
      observedGeneration: cs.metadata!.generation,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pepr/operator/reconcilers/clusterset-reconciler.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Stage**

```bash
git add src/pepr/operator/reconcilers/clusterset-reconciler.ts src/pepr/operator/reconcilers/clusterset-reconciler.spec.ts
```

---

### Task 7: Register the watch in the operator

**Files:**
- Modify: `src/pepr/operator/index.ts`

- [ ] **Step 1: Add the import** (with the other CRD/reconciler imports near the top)

Update the CRD import to include ClusterSet:

```typescript
import { ClusterConfig, ClusterSet, UDSExemption, UDSPackage } from "./crd";
```

Add the reconciler import (near the `package-reconciler` import, ~line 52):

```typescript
import { clusterSetReconciler } from "./reconcilers/clusterset-reconciler";
```

- [ ] **Step 2: Register the watch** (after the `ClusterConfig` watch block, ~line 139)

```typescript
// Watch UDS ClusterSet and reconcile
When(ClusterSet).IsCreatedOrUpdated().Reconcile(clusterSetReconciler);
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `operator/index.ts`, `ClusterSet`, or `clusterSetReconciler`.

- [ ] **Step 4: Run the full pepr unit suite**

Run: `npm run test:unit`
Expected: PASS, including the new `clusterset-reconciler.spec.ts`; no regressions.

- [ ] **Step 5: Stage**

```bash
git add src/pepr/operator/index.ts
```

---

### Task 8: Deploy the CRD and verify it stores a ClusterSet

This proves the CRD installs and accepts a resource. Live reconciliation requires the
Pepr operator running in-cluster — that is integration-level and deferred. Use the `hub`
cluster from the two-cluster env (`tasks/multicluster.yaml up`).

**Files:** none (verification only)

- [ ] **Step 1: Apply the CRD to hub**

Run: `uds zarf tools kubectl apply --context k3d-hub -f src/pepr/uds-cluster-crds/templates/clustersets.uds.dev.yaml`
Expected: `customresourcedefinition.apiextensions.k8s.io/clustersets.uds.dev created`.

- [ ] **Step 2: Create a sample ClusterSet**

Run:
```bash
uds zarf tools kubectl apply --context k3d-hub -f - <<'EOF'
apiVersion: uds.dev/v1alpha1
kind: ClusterSet
metadata:
  name: mission-edge
spec:
  provider: submariner
  clusters:
    - name: hub
    - name: edge-1
EOF
```
Expected: `clusterset.uds.dev/mission-edge created`.

- [ ] **Step 3: Verify it stored with printer columns**

Run: `uds zarf tools kubectl get clusterset --context k3d-hub`
Expected: a row `mission-edge` with `PROVIDER` = `submariner` (STATUS empty until the operator runs).

- [ ] **Step 4: Clean up the sample**

Run: `uds zarf tools kubectl delete clusterset mission-edge --context k3d-hub`
Expected: `clusterset.uds.dev "mission-edge" deleted`.

---

## Self-review

- **Spec coverage:** Implements design §5.1 (ClusterSet CRD: `uds.dev/v1alpha1`, cluster-scoped, `spec.provider` + `spec.clusters[].name`, status with phase). Status `clusters[]` shape is defined now so the later aggregation task (design §5.3 / task #9) only fills it. Validator omitted intentionally (design stretch §11 #2). Package multicluster field (§5.2) and ServiceExport reconciler (§5.3) are separate plans.
- **Placeholders:** none — every step has concrete code/commands and expected output. Task 5 and Task 7 note "confirm the generated names" because kfc derives interface/enum names from the schema; the export must match the actual generated file (verified in Task 4 Step 3).
- **Type consistency:** `clusterSetReconciler(cs: ClusterSet)` is used identically in the reconciler, its test, and the operator registration. `ClusterSet` is imported from `../crd` everywhere. The plural `clustersets`, kind `ClusterSet`, and file name `clusterset-v1alpha1.ts` match across the source manifest (Task 2), the kfc commands (Task 3), and the index export (Task 5).

## Risks to retire during execution

- **kfc-derived names:** the generated enum for phase may be `Phase` with members `Pending/Ready/Failed`. Task 6's reconciler uses the string literal `"Ready"` to avoid coupling to the generated enum name; if you prefer the enum, import it and confirm its name from Task 4's output first.
- **addlicense dependency:** `gen-crds` calls `$HOME/go/bin/addlicense`. If absent, the task fails at the license step *after* generating files — the generated artifacts are still valid; install addlicense or re-run just the license action.
- **`PatchStatus` requires the status subresource** to exist on the CRD — it does (Task 1 declares `subresources.status`).
