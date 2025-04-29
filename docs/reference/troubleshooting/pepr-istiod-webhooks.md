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
- Cluster logs show webhook admission errors like:
```plaintext
Failed to call webhook: error calling webhook "pepr-uds-core"
Failed to call webhook: error calling webhook "istiod-istio-system"
```

## Why This Happens
Both Pepr and Istiod register Kubernetes admission webhooks.
When a cluster restarts, if the webhook targets (pods) aren’t available yet, admission fails, blocking the pods from being recreated — a chicken-and-egg problem.

Temporarily relaxing webhook `failurePolicy` solves the startup deadlock.

## Manual Recovery Procedure
Temporarily disable the `failurePolicy` for the Pepr and Istiod webhooks, allowing pods to start.

### 1. Edit the Pepr Webhooks
```bash
kubectl edit mutatingwebhookconfiguration pepr-uds-core
kubectl edit validatingwebhookconfiguration pepr-uds-core
```

In each file, locate:

```yaml
failurePolicy: Fail
```
Change it to:

```yaml
failurePolicy: Ignore
```
Save and exit.

### 2. Edit the Istiod Webhooks
```bash
kubectl edit mutatingwebhookconfiguration istio-sidecar-injector
kubectl edit validatingwebhookconfiguration istio-validator-istio-system
```

Again, change:

```yaml
failurePolicy: Fail
```
To:

```yaml
failurePolicy: Ignore
```
Save and exit.

### 3. Restart the Pepr and Istiod Pods
Manually delete the stuck pods so they restart:

```bash
kubectl delete pods -n pepr-system -l app.kubernetes.io/name=pepr
kubectl delete pods -n istio-system -l app=istiod
```
This forces Kubernetes to recreate them.

Now, because `failurePolicy=Ignore`, they will successfully come up even if the webhooks aren’t ready yet.

### 4. Restore the Webhooks Back to Fail
:::caution
VERY IMPORTANT:
After both Pepr and Istiod pods are running and healthy, revert your webhook configurations:
Edit all four webhook configurations again:
Set `failurePolicy: Fail` instead of `Ignore`.
:::

This restores strict security enforcement in admission control.
