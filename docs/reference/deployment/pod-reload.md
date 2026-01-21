---
title: Pod Reload
tableOfContents:
  maxHeadingLevel: 4
---

UDS Core provides a Pod Reload mechanism that automatically reloads pods when Secrets or ConfigMaps are updated. This feature is particularly useful for credentials, certificates, and configuration data that applications need to refresh without manual intervention.

## How It Works

The pod reload controller watches for changes to Kubernetes Secrets and ConfigMaps labeled with `uds.dev/pod-reload: "true"`. When such a resource is updated, the controller will:

1. Identify which pods or deployments should be restarted
2. For pods managed by standard controllers (Deployments, ReplicaSets, StatefulSets, DaemonSets), restart by patching the controller's pod template annotations
3. For standalone pods or other cases, use pod eviction to trigger recreation
4. Generate Kubernetes events to track the restart operations

## Configuration

### Enabling Pod Reload

To enable automatic pod reload when a secret or ConfigMap changes, add the following label to your resource:

```yaml
metadata:
  labels:
    uds.dev/pod-reload: "true"
```

### Targeting Pods for Restart

There are two ways to specify which pods should be restarted when a resource changes:

#### 1. Explicit Pod Selector

You can explicitly specify which pods should be restarted using the `uds.dev/pod-reload-selector` annotation:

```yaml
metadata:
  annotations:
    uds.dev/pod-reload-selector: 'app=my-app,tier=frontend'
```

This will restart all pods matching the specified label selector when the resource changes.

#### 2. Auto-Discovery (Default)

If you don't specify a pod selector, UDS Core will automatically discover and restart pods that are consuming the resource through:
- Volume mounts (Secret or ConfigMap volumes)
- Environment variables (env or envFrom)
- Projected volumes using the Secret or ConfigMap

This auto-discovery approach ensures that only pods actually using the resource are restarted.

## Examples

### Secret Example

Here's an example of a Secret with pod reload enabled:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-database-credentials
  namespace: my-app
  labels:
    uds.dev/pod-reload: "true"
  annotations:
    uds.dev/pod-reload-selector: 'app=my-app,component=database'
type: Opaque
data:
  username: YWRtaW4=  # base64 encoded "admin"
  password: cGFzc3dvcmQxMjM=  # base64 encoded "password123"
```

When this secret is updated (for example, when rotating the database password), all pods with the labels `app=my-app` and `component=database` will be automatically reloaded to pick up the new credentials.

### ConfigMap Example

Here's an example of a ConfigMap with pod reload enabled:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: falco-rules
  namespace: security
  labels:
    uds.dev/pod-reload: "true"
data:
  falco_rules.yaml: |
    - rule: Detect Suspicious File Access
      desc: Detect attempts to access sensitive files
      condition: open_read and sensitive_files
      output: Sensitive file opened for reading (user=%user.name file=%fd.name)
      priority: WARNING
```

When this ConfigMap is updated (for example, when adding new security rules), all pods that mount this ConfigMap will be automatically reloaded to pick up the new configuration.

## Integration with SSO

The Pod Reload functionality can be used with SSO client secrets. You can enable this by adding the `uds.dev/pod-reload: "true"` label to your SSO client secrets through the `secretConfig.labels` field in your Package CR.

For more details on configuring Pod Reload for SSO clients, see the [Secret Templating documentation](/reference/configuration/single-sign-on/sso-templating#secret-pod-reload).

## Monitoring and Troubleshooting

When a resource is updated and triggers a restart, the controller generates Kubernetes events with the reason `SecretChanged` or `ConfigMapChanged`. You can view these events using:

```bash
kubectl get events -n <namespace> --field-selector reason=SecretChanged
kubectl get events -n <namespace> --field-selector reason=ConfigMapChanged
```

Additionally, when deployments are restarted, you'll see `ScalingReplicaSet` events for the affected deployments.

The controller adds an annotation `uds.dev/restartedAt` to deployment pod templates when they're restarted, which can be used to track when the last restart occurred.
