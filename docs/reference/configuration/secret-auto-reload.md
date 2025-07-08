---
title: Secret Auto-Reload
---

UDS Core provides an automatic secret reload mechanism that can restart pods or deployments when secrets are updated. This feature is particularly useful for credentials, certificates, and configuration data that applications need to refresh without manual intervention.

## How It Works

The secret auto-reload controller watches for changes to Kubernetes secrets labeled with `uds.dev/watch: "true"`. When such a secret is updated, the controller will:

1. Identify which pods or deployments should be restarted
2. For pods managed by standard controllers (Deployments, ReplicaSets, StatefulSets, DaemonSets), restart by patching the controller's pod template annotations
3. For standalone pods or other cases, use pod rotation via eviction to trigger recreation
4. Generate Kubernetes events to track the restart operations

## Configuration

### Enabling Secret Auto-Reload

To enable automatic reloading when a secret changes, add the following label to your secret:

```yaml
metadata:
  labels:
    uds.dev/watch: "true"
```

### Targeting Pods for Restart

There are two ways to specify which pods should be restarted when a secret changes:

#### 1. Explicit Pod Selector

You can explicitly specify which pods should be restarted using the `uds.dev/pod-selector` annotation:

```yaml
metadata:
  annotations:
    uds.dev/pod-selector: 'app=my-app,tier=frontend'
```

This will restart all pods matching the specified label selector when the secret changes.

#### 2. Auto-Discovery (Default)

If you don't specify a pod selector, UDS Core will automatically discover and restart pods that are consuming the secret through:
- Volume mounts (secret volumes)
- Environment variables (env or envFrom)
- Projected volumes using the secret

This auto-discovery approach ensures that only pods actually using the secret are restarted.

## Example

Here's an example of a secret with auto-reload enabled:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-database-credentials
  namespace: my-app
  labels:
    uds.dev/watch: "true"
  annotations:
    uds.dev/pod-selector: 'app=my-app,component=database'
type: Opaque
data:
  username: YWRtaW4=  # base64 encoded "admin"
  password: cGFzc3dvcmQxMjM=  # base64 encoded "password123"
```

When this secret is updated (for example, when rotating the database password), all pods with the labels `app=my-app` and `component=database` will be automatically rotated to pick up the new credentials.

## Integration with SSO

The secret auto-reload functionality can be used with SSO client secrets. You can enable this by adding the `uds.dev/watch: "true"` label to your SSO client secrets through the `secretLabels` field in your Package CR.

For more details on configuring secret auto-reload for SSO clients, see the [Secret Templating documentation](/reference/configuration/single-sign-on/sso-templating#secret-auto-reload).

## Monitoring and Troubleshooting

When a secret is updated and triggers a restart, the controller generates Kubernetes events with the reason `SecretChanged`. You can view these events using:

```bash
kubectl get events -n <namespace> --field-selector reason=SecretChanged
```

Additionally, when deployments are restarted, you'll see `ScalingReplicaSet` events for the affected deployments.

The controller adds an annotation `uds.dev/restartedAt` to deployment pod templates when they're restarted, which can be used to track when the last restart occurred.
