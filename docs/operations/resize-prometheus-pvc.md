---
title: Resize Prometheus PVCs
sidebar:
  order: 3
---

## Purpose

Use this runbook to manually resize Prometheus PVCs managed by Prometheus Operator when storage requirements increase.

This procedure follows upstream guidance from Prometheus Operator:

- https://prometheus-operator.dev/docs/platform/storage/#resizing-volumes

## Scope

- Resize only (no retention tuning).
- Intended for UDS Core deployments using `kube-prometheus-stack`.
- Safe for mixed environments as long as prechecks pass.

## Prerequisites

- `kubectl` access with permissions to patch Prometheus CRs and PVCs and delete StatefulSets.
- Correct kube context selected.
- Target Prometheus instance identified.
- StorageClass for target PVCs supports expansion (`allowVolumeExpansion=true`).

This runbook assumes UDS Core defaults:

- Namespace: `monitoring`
- Prometheus CR name: `kube-prometheus-stack-prometheus`

If your deployment uses non-default names, update the commands accordingly.

## Variables

Set the target size before running commands:

```bash
export TARGET_SIZE=60Gi
```

Confirm the defaults exist in your cluster:

This confirms the expected Prometheus CR exists before continuing.

```bash
kubectl get prometheus -n monitoring kube-prometheus-stack-prometheus
```

## Update Bundle Configuration

Set the target size in your UDS bundle so desired Prometheus storage is captured in code before running manual resize steps.

### Option A: Direct override value in `uds-bundle.yaml`

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

### Option B: Bundle variable with value in `uds-config.yaml`

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

1. Confirm matching PVCs:

This lists the PVCs that will be resized and verifies label selection is correct.

```bash
kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
```

2. Confirm StorageClass and expansion support:

Use this output to verify each target PVC has a StorageClass and that class supports expansion. If expansion is not supported, stop and reassess.

```bash
# Determine the storage class in use
kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o custom-columns=NAME:.metadata.name,SC:.spec.storageClassName,REQ:.spec.resources.requests.storage

# Show whether volume expansion is enabled in each storage class
kubectl get storageclass -o custom-columns=NAME:.metadata.name,ALLOWVOLUMEEXPANSION:.allowVolumeExpansion
```

3. Confirm this is a size increase (never shrink):

Compare current PVC request sizes to `TARGET_SIZE`; continue only for a size increase.

```bash
kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.resources.requests.storage}{"\n"}{end}'
```

If any target PVC is already larger than `TARGET_SIZE`, stop and reassess.

4. Confirm the size you configured in your uds-bundle and/or uds-config match `TARGET_SIZE`.

## Procedure

1. Update bundle configuration to the target size (see examples above).

2. Pause Prometheus reconciliation:

Pausing prevents operator reconciliation churn while you patch PVCs and rotate the StatefulSet.

```bash
kubectl patch prometheus kube-prometheus-stack-prometheus -n monitoring --type merge --patch '{"spec":{"paused":true}}'
```

3. Create and deploy the updated bundle using your established UDS Core bundle creation and deployment workflows so Prometheus desired storage is updated from code.

4. Patch each existing PVC to the new request size:

This updates the requested storage on all existing Prometheus PVCs to match bundle desired state.

```bash
kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
| xargs -I{} kubectl patch pvc "{}" -n monitoring --type merge \
  --patch "{\"spec\":{\"resources\":{\"requests\":{\"storage\":\"$TARGET_SIZE\"}}}}"
```

5. Delete backing StatefulSet with orphan strategy:

Orphan deletion removes the StatefulSet object but preserves pods/PVCs so Prometheus Operator can recreate the StatefulSet against resized PVCs.

```bash
kubectl delete statefulset -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" --cascade=orphan
```

6. Unpause Prometheus reconciliation:

Unpausing allows Prometheus Operator to reconcile resources back to normal managed state.

```bash
kubectl patch prometheus kube-prometheus-stack-prometheus -n monitoring --type merge --patch '{"spec":{"paused":false}}'
```

## Verification

1. Prometheus CR is unpaused:

This confirms operator reconciliation is re-enabled.

```bash
kubectl get prometheus kube-prometheus-stack-prometheus -n monitoring -o jsonpath='{.spec.paused}{"\n"}'
```

Expected: `false`

2. PVC requests show the new size:

All listed PVC `REQ` values should match `TARGET_SIZE`.

```bash
kubectl get pvc -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus" -o custom-columns=NAME:.metadata.name,REQ:.spec.resources.requests.storage
```

3. StatefulSet is recreated by operator:

You should see a recreated StatefulSet present for the Prometheus instance.

```bash
kubectl get statefulset -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
```

4. Confirm Prometheus pods are Running/Ready:

Pods should be `Running`/`Ready` before closing the operation.

```bash
kubectl get pod -n monitoring -l "operator.prometheus.io/name=kube-prometheus-stack-prometheus"
```

## Failure Handling

- If any step fails after pause, ensure unpause is restored:

```bash
kubectl patch prometheus kube-prometheus-stack-prometheus -n monitoring --type merge --patch '{"spec":{"paused":false}}'
```

- If StorageClass is not expandable, do not continue this runbook.

- If one PVC patch fails, resolve that PVC issue first, then continue from Procedure step 4.
