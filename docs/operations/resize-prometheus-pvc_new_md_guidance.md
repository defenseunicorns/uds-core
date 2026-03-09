---
title: Resize Prometheus PVCs
sidebar:
  order: 3
---

## Purpose

Use this runbook to manually resize Prometheus PVCs managed by Prometheus Operator when
you need more storage.

This procedure follows upstream guidance from Prometheus Operator:

- https://prometheus-operator.dev/docs/platform/storage/#resizing-volumes

## Scope

This runbook covers a straightforward PVC size increase:

- Resize only. It does not cover retention tuning.
- It is written for UDS Core deployments that use `kube-prometheus-stack`.
- It is safe for mixed environments as long as the prechecks pass.

## Prerequisites

Before you start, make sure you have:

- `kubectl` access with permission to patch Prometheus CRs and PVCs and delete
  StatefulSets
- the correct kube context selected
- the target Prometheus instance identified
- a StorageClass for the target PVCs that supports expansion (`allowVolumeExpansion=true`)

This runbook assumes these UDS Core defaults:

- Namespace: `monitoring`
- Prometheus CR name: `kube-prometheus-stack-prometheus`

If your deployment uses non-default names, update the commands accordingly.

## Target Size

Set the target size before running commands:

```bash
export TARGET_SIZE=60Gi
```

Confirm those defaults exist in your cluster before you continue:

```bash
kubectl get prometheus -n monitoring kube-prometheus-stack-prometheus
```

## Update Bundle Configuration

Set the target size in your UDS bundle first so your desired Prometheus storage is captured
in code before you make manual changes.

### Option A: Direct Override Value in `uds-bundle.yaml`

```yaml title="uds-bundle.yaml"
packages:
  - name: core
    overrides:
      kube-prometheus-stack:
        kube-prometheus-stack:
          values:
            - path: prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage
              value: "60Gi"
```

### Option B: Bundle Variable With Value in `uds-config.yaml`

```yaml title="uds-bundle.yaml"
packages:
  - name: core
    overrides:
      kube-prometheus-stack:
        kube-prometheus-stack:
          variables:
            - name: PROMETHEUS_STORAGE_SIZE
              description: Prometheus PVC requested storage size
              path: prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage
```

```yaml title="uds-config.yaml"
variables:
  core:
    prometheus_storage_size: "60Gi"
```

## Prechecks

Run these checks before you make any changes:

1. Confirm matching PVCs:

   This shows the PVCs you are about to resize and confirms the label selector is correct.

   ```bash
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
   ```

2. Confirm StorageClass and expansion support:

   Use this output to verify each target PVC has a StorageClass and that the class supports
   expansion. If expansion is not supported, stop here and reassess.

   ```bash
   # Determine the storage class in use
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o custom-columns=NAME:.metadata.name,SC:.spec.storageClassName,REQ:.spec.resources.requests.storage

   # Show whether volume expansion is enabled in each storage class
   kubectl get storageclass -o custom-columns=NAME:.metadata.name,ALLOWVOLUMEEXPANSION:.allowVolumeExpansion
   ```

3. Confirm this is a size increase:

   Compare current PVC request sizes to `TARGET_SIZE`. Only continue if this is a size
   increase.

   ```bash
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.resources.requests.storage}{"\n"}{end}'
   ```

   If any target PVC is already larger than `TARGET_SIZE`, stop here and reassess.

4. Confirm the size configured in your `uds-bundle.yaml` and/or `uds-config.yaml` matches `TARGET_SIZE`.

## Procedure

Follow these steps in order:

1. Update bundle configuration to the target size.

   Use one of the examples in the earlier section.

2. Pause Prometheus reconciliation:

   This keeps the operator from fighting your manual changes while you patch PVCs and rotate
   the StatefulSet.

   ```bash
   kubectl patch prometheus kube-prometheus-stack-prometheus -n monitoring --type merge --patch '{"spec":{"paused":true}}'
   ```

3. Create and deploy the updated bundle using your normal UDS Core bundle workflow.

   This applies the desired Prometheus storage size from code before you patch the existing
   PVCs.

4. Patch each existing PVC to the new request size:

   This updates the requested storage on all existing Prometheus PVCs to match the bundle's
   desired state.

   ```bash
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" \
     -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
   | xargs -I{} kubectl patch pvc "{}" -n monitoring --type merge \
     --patch "{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"$TARGET_SIZE\"}}}}"
   ```

   During and after patching, watch PVC events for resize progress or errors:

   ```bash
   kubectl describe pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
   ```

   Sometimes the volume expands first, but the filesystem still needs a pod restart to catch
   up. If that happens, the PVC may show `FileSystemResizePending` and `CAP` may stay below
   `REQ`. Check for that before you continue:

   ```bash
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o custom-columns=NAME:.metadata.name,REQ:.spec.resources.requests.storage,CAP:.status.capacity.storage,CONDITION:.status.conditions[*].type
   ```

   If any target PVC shows `FileSystemResizePending`, restart the affected Prometheus pod(s).
   Then confirm `CAP` converges to `REQ` before you continue:

   ```bash
   kubectl delete pod -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
   ```

5. Delete the backing StatefulSet with the orphan strategy:

   This removes the StatefulSet object while keeping the pods and PVCs in place, so
   Prometheus Operator can recreate the StatefulSet against the resized PVCs.

   ```bash
   kubectl delete statefulset -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" --cascade=orphan
   ```

6. Unpause Prometheus reconciliation:

   This lets Prometheus Operator return the resources to their normal managed state.

   ```bash
   kubectl patch prometheus kube-prometheus-stack-prometheus -n monitoring --type merge --patch '{"spec":{"paused":false}}'
   ```

## Verification

Use these checks to confirm the resize finished cleanly:

1. Confirm the Prometheus CR is unpaused:

   This confirms operator reconciliation is running again.

   ```bash
   kubectl get prometheus kube-prometheus-stack-prometheus -n monitoring -o jsonpath='{.spec.paused}{"\n"}'
   ```

   Expected: `false`

2. Confirm PVC requests show the new size:

   Every listed PVC `REQ` value should match `TARGET_SIZE`.

   ```bash
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o custom-columns=NAME:.metadata.name,REQ:.spec.resources.requests.storage
   ```

3. Confirm the StatefulSet is recreated by the operator:

   You should see a recreated StatefulSet for the Prometheus instance.

   ```bash
   kubectl get statefulset -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
   ```

4. Confirm Prometheus pods are `Running` and `Ready`:

   Make sure the pods are healthy before you close the operation.

   ```bash
   kubectl get pod -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
   ```

5. Confirm PVC capacity has reconciled to the new size:

   This confirms the resize actually finished, not just that the new size was requested.

   ```bash
   kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o custom-columns=NAME:.metadata.name,REQ:.spec.resources.requests.storage,CAP:.status.capacity.storage
   ```

   Expected: `CAP` matches `REQ`, or it converges shortly after.

## Failure Handling

Use these checks if the resize does not settle cleanly:

- If any step fails after pause, make sure you unpause Prometheus reconciliation:

  ```bash
  kubectl patch prometheus kube-prometheus-stack-prometheus -n monitoring --type merge --patch '{"spec":{"paused":false}}'
  ```

- If the StorageClass is not expandable, do not continue this runbook.
- If one PVC patch fails, resolve that PVC issue first, then continue from Procedure step 4.
- If PVCs remain in `ExternalExpanding` without a capacity change for an extended period, stop
  and reassess.
- If a PVC shows `FileSystemResizePending`, or if `CAP` does not converge to `REQ` after
  controller-side expansion, restart the affected Prometheus pod(s), then re-check PVC
  conditions and capacity.
