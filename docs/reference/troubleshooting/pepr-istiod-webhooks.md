---
title: Istiod and Pepr Startup Failures Due to Webhook Dependencies

sidebar:
  order: 1
---

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
Temporarily modify the Pepr mutating and validating webhooks, as well as the Istiod mutating webhook, to exclude each other:

### 1. Patch the Pepr Webhooks to Exclude Itself and Istio

```bash
kubectl patch mutatingwebhookconfiguration pepr-uds-core --type='json' \
  -p='[{
    "op": "replace",
    "path": "/webhooks/0/namespaceSelector",
    "value": {
      "matchExpressions": [{
        "key": "kubernetes.io/metadata.name",
        "operator": "NotIn",
        "values": ["pepr-system", "istio-system"]
      }]
    }
  }]'

kubectl patch validatingwebhookconfiguration pepr-uds-core --type='json' \
  -p='[{
    "op": "replace",
    "path": "/webhooks/0/namespaceSelector",
    "value": {
      "matchExpressions": [{
        "key": "kubernetes.io/metadata.name",
        "operator": "NotIn",
        "values": ["pepr-system", "istio-system"]
      }]
    }
  }]'
```

### 2. Patch the Istiod Mutating Webhook to Exclude Pepr

```bash
kubectl patch mutatingwebhookconfiguration istio-sidecar-injector --type='json' \
  -p='[{
    "op": "replace",
    "path": "/webhooks/0/namespaceSelector",
    "value": {
      "matchExpressions": [{
        "key": "kubernetes.io/metadata.name",
        "operator": "NotIn",
        "values": ["pepr-system"]
      }]
    }
  }]'
```

### 3. Restart the Pepr and Istiod Pods
This isn't always required — typically the pods will retry and succeed once the webhooks have been patched.

```bash
kubectl rollout restart deployment pepr-uds-core -n pepr-system
kubectl rollout restart deployment istiod -n istio-system
```
This forces Kubernetes to recreate them.

### 4. Restore the Webhook Policies

:::caution
VERY IMPORTANT:
After both Pepr and Istiod pods are running and healthy, revert your webhook configurations by removing the namespace selectors to restore full admission enforcement.
:::

```bash
kubectl patch mutatingwebhookconfiguration pepr-uds-core --type='json' \
  -p='[{"op": "remove", "path": "/webhooks/0/namespaceSelector"}]'

kubectl patch validatingwebhookconfiguration pepr-uds-core --type='json' \
  -p='[{"op": "remove", "path": "/webhooks/0/namespaceSelector"}]'

kubectl patch mutatingwebhookconfiguration istio-sidecar-injector --type='json' \
  -p='[{"op": "remove", "path": "/webhooks/0/namespaceSelector"}]'
```
This restores strict security enforcement in admission control.

:::caution
While the webhooks are excluding each other, any newly created resources (e.g., Pods) could bypass Istio sidecar injection or Pepr policy enforcement. This is rare but possible — identify and reapply configuration to any workloads started during this window.
:::

## Alternative Ideas
Rather than changing webhook failure policies, consider long-term approaches such as:

- Adding a `namespaceSelector` to exclude the `istio-system` namespace from Pepr’s webhooks and vice versa.
- Removing the Istio injection label from Pepr pods (especially if you're using Ambient Mesh).

These strategies help prevent circular dependencies without relaxing webhook enforcement.
