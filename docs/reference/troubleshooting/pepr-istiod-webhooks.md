---
title: Istiod and Pepr Startup Failures Due to Webhook Dependencies

sidebar:
  order: 1
---

:::note
The following issue should not occur in UDS Core 0.50.0+ due to changes in default webhook configuration. This troubleshooting guide is provided as a reference for older versions of UDS Core.
:::

## Overview
During cluster restarts or after upgrades, Istiod and Pepr pods may fail to start properly due to a circular dependency between their admission webhooks.

Both Istiod and Pepr depend on each other’s webhooks being available, which can cause a deadlock if one cannot admit the other’s workloads.

This document explains how to manually resolve the deadlock.

## Symptoms
- Pepr pods are stuck in CrashLoopBackOff or Pending state.
- Istiod pods are stuck in CrashLoopBackOff or Pending state.
- Cluster replicaset events show webhook admission errors like:
```plaintext
Failed to call webhook: error calling webhook "pepr-uds-core"
Failed to call webhook: error calling webhook "istiod-istio-system"
```

## Why This Happens
Both Pepr and Istiod register Kubernetes admission webhooks.
When a cluster restarts, if the webhook targets (pods) aren’t available yet, admission fails, blocking the pods from being recreated — a chicken-and-egg problem.

## Manual Recovery Procedure
Temporarily modify the Pepr mutating and validating webhooks to exclude each other:

### 1. Patch the Pepr Webhooks to Exclude Itself and Istio

```bash
kubectl patch mutatingwebhookconfiguration pepr-uds-core --type='json' \
  -p='[{
    "op": "add",
    "path": "/webhooks/0/namespaceSelector/matchExpressions/0/values/-",
    "value": "istio-system"
  }]'

kubectl patch validatingwebhookconfiguration pepr-uds-core --type='json' \
  -p='[{
    "op": "add",
    "path": "/webhooks/0/namespaceSelector/matchExpressions/0/values/-",
    "value": "istio-system"
  }]'
```

### 2. Restart the Pepr and Istiod Pods
This isn't always required — typically the pods will retry and succeed once Istiod is healthy.

```bash
kubectl rollout restart deployment pepr-uds-core -n pepr-system
kubectl rollout restart deployment istiod -n istio-system
```
This forces Kubernetes to recreate them.

### 3. Restore the Webhook Policies

:::caution
VERY IMPORTANT:
After both Pepr and Istiod pods are running and healthy, revert your webhook configurations by removing the namespace selectors to restore full admission enforcement.
:::

```bash
kubectl get mutatingwebhookconfiguration pepr-uds-core -o json | \
  uds zarf tools yq -p json -o json '.webhooks[0].namespaceSelector.matchExpressions[0].values |= map(select(. != "istio-system"))' | \
  kubectl apply -f -

kubectl get validatingwebhookconfiguration pepr-uds-core -o json | \
  uds zarf tools yq -p json -o json '.webhooks[0].namespaceSelector.matchExpressions[0].values |= map(select(. != "istio-system"))' | \
  kubectl apply -f -
```
This restores strict security enforcement in admission control.

:::caution
While the Pepr webhooks are excluding `istio-system`, any newly created resources in the `istio-system` namespace (e.g., pods/services) will bypass Pepr policy enforcement. It is important to audit any new/unexpected resources during this time.
:::
