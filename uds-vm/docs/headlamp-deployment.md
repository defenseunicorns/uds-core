# Deploy Headlamp with KubeVirt plugin

This guide walks you through deploying Headlamp with the KubeVirt plugin for browser-based VM management. Headlamp provides a Kubernetes dashboard, and the [naval-group/headlamp-kubevirt](https://github.com/naval-group/headlamp-kubevirt) plugin adds VM inventory, lifecycle actions, and VNC/console access.

## Prerequisites

- UDS Core deployed on a Kubernetes cluster with KubeVirt and CDI installed (see [Windows VM deployment](./windows-vm-deployment.md) for the full cluster setup)
- `kubectl` access to the cluster
- `helm` installed
- At least one VM running for validation (Linux or Windows)

## Helm chart and plugin versions

Use these tested versions:

- Headlamp chart: `0.43.0` from `https://kubernetes-sigs.github.io/headlamp/`
- KubeVirt plugin image: `ghcr.io/naval-group/headlamp-kubevirt:latest`

Add the Helm repo before deploying:

```bash
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm repo update
```

## Steps

### 1. Create the RBAC resources

Headlamp needs a dedicated ServiceAccount with KubeVirt permissions. The default service account does not have the subresource access required for VNC, console, and lifecycle actions.

Apply this manifest to create the ServiceAccount, ClusterRole, and ClusterRoleBinding:

```yaml title="headlamp-kubevirt-rbac.yaml"
apiVersion: v1
kind: ServiceAccount
metadata:
  name: headlamp-kubevirt
  namespace: headlamp
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: headlamp-kubevirt-validation
rules:
  # KubeVirt VM lifecycle
  - apiGroups:
      - kubevirt.io
    resources:
      - virtualmachines
      - virtualmachineinstances
      - virtualmachineinstancemigrations
    verbs:
      - get
      - list
      - watch
      - patch
      - update
  # VNC, console, portforward, and power actions
  - apiGroups:
      - subresources.kubevirt.io
    resources:
      - virtualmachines/start
      - virtualmachines/stop
      - virtualmachines/restart
      - virtualmachineinstances/vnc
      - virtualmachineinstances/console
      - virtualmachineinstances/portforward
    verbs:
      - get
      - update
  # CDI data volumes
  - apiGroups:
      - cdi.kubevirt.io
    resources:
      - datavolumes
      - datasources
      - dataimportcrons
    verbs:
      - get
      - list
      - watch
  # Core resources for Headlamp operation
  - apiGroups:
      - ""
    resources:
      - pods
      - pods/log
      - persistentvolumeclaims
      - events
      - services
      - nodes
      - namespaces
      - configmaps
      - serviceaccounts
    verbs:
      - get
      - list
      - watch
  # Apps for deployment visibility
  - apiGroups:
      - apps
    resources:
      - deployments
      - statefulsets
      - daemonsets
      - replicasets
    verbs:
      - get
      - list
      - watch
  # Networking
  - apiGroups:
      - networking.k8s.io
    resources:
      - ingresses
      - networkpolicies
    verbs:
      - get
      - list
      - watch
  # Gateway API
  - apiGroups:
      - gateway.networking.k8s.io
    resources:
      - gateways
      - httproutes
    verbs:
      - get
      - list
      - watch
  # Autoscaling
  - apiGroups:
      - autoscaling
    resources:
      - horizontalpodautoscalers
    verbs:
      - get
      - list
      - watch
  # Batch jobs
  - apiGroups:
      - batch
    resources:
      - jobs
      - cronjobs
    verbs:
      - get
      - list
      - watch
  # RBAC
  - apiGroups:
      - rbac.authorization.k8s.io
    resources:
      - roles
      - rolebindings
      - clusterroles
      - clusterrolebindings
    verbs:
      - get
      - list
      - watch
  # Security policies
  - apiGroups:
      - security.istio.io
    resources:
      - peerauthentications
    verbs:
      - get
      - list
      - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: headlamp-kubevirt-validation
subjects:
  - kind: ServiceAccount
    name: headlamp-kubevirt
    namespace: headlamp
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: headlamp-kubevirt-validation
```

```bash
kubectl apply -f headlamp-kubevirt-rbac.yaml
```

### 2. Create the namespace

```bash
kubectl create namespace headlamp
```

### 3. Create the Helm values file

This is the critical configuration. Several fields are non-obvious and require specific values:

```yaml title="headlamp-values.yaml"
replicaCount: 1

serviceAccount:
  create: false
  name: headlamp-kubevirt

config:
  # Register the in-cluster context with name "default" so the kubevirt plugin
  # can find it. The plugin constructs WebSocket URLs using the cluster name
  # from `o.cluster || "default"`, so this must match.
  inCluster: true
  inClusterContextName: "default"
  # Bypass OIDC; all requests authenticate as the pod's service account.
  unsafeUseServiceAccountToken: true
  clusters: []

initContainers:
  - name: headlamp-kubevirt
    image: ghcr.io/naval-group/headlamp-kubevirt:latest
    command:
      - /bin/sh
      - -c
    args:
      - |
        cp -r /plugins/kubevirt /headlamp-plugins/
        # Strip the headlamp auth protocol from WebSocket VNC connections.
        # unsafeUseServiceAccountToken stores the SA subject as userId in
        # localStorage. The plugin sends it as a WebSocket subprotocol
        # (base64url.headlamp.authorization.k8s.io.${userId}), but Headlamp's
        # websocketConnContextKey regex ([a-zA-Z0-9_-]+) stops at the colons
        # in SA subjects (e.g. "system:serviceaccount:headlamp:headlamp-kubevirt"),
        # creating a composite key "default\x00system" that does not match the
        # in-cluster context "default". Removing the protocol fixes VNC.
        awk '{gsub(/,\.\.\.F\?.*\]:\[\]/, "")} 1' /headlamp-plugins/kubevirt/main.js > /tmp/p.js && mv /tmp/p.js /headlamp-plugins/kubevirt/main.js
        echo "Patched kubevirt plugin to remove headlamp auth protocol"
    volumeMounts:
      - name: headlamp-plugins
        mountPath: /headlamp-plugins

volumeMounts:
  - name: headlamp-plugins
    mountPath: /headlamp/plugins

volumes:
  - name: headlamp-plugins
    emptyDir: {}
```

Key configuration decisions:

- **`inClusterContextName: "default"`**: The kubevirt plugin constructs WebSocket URLs using `/clusters/${clusterName}/...`. The plugin defaults `clusterName` to `"default"`. If Headlamp's in-cluster context name does not match, VNC connections fail with `"failed to get context"` errors.
- **`unsafeUseServiceAccountToken: true`**: Bypasses OIDC. All Headlamp requests authenticate as the pod's service account token. This is appropriate for local validation but not for production.
- **`clusters: []`**: The `config.clusters` field is for external clusters only. Omitting it prevents duplicate or conflicting cluster registrations.
- **The awk patch**: The kubevirt plugin's VNC code sends `base64url.headlamp.authorization.k8s.io.${userId}` as a WebSocket subprotocol. When `userId` contains colons (as SA subjects do), Headlamp's backend regex extracts only up to the first colon, producing a context key that does not match. The patch removes this conditional entirely. This is a workaround until the plugin is updated upstream.
- **The init container image uses busybox**: The `awk` command is available in the `ghcr.io/naval-group/headlamp-kubevirt` image (which is busybox-based). `perl` and `node` are not available.

### 4. Deploy with Helm

```bash
helm upgrade --install headlamp headlamp/headlamp \
  --namespace headlamp \
  -f headlamp-values.yaml
```

> [!WARNING]
> Zarf's `agent-pod.zarf.dev` MutatingWebhookConfiguration (failurePolicy: Fail) intercepts pod CREATE/UPDATE in all namespaces except `kube-system` and rewrites image references to `127.0.0.1:31999/...` tags. These tags do not exist for non-Zarf packages like Headlamp. If the Headlamp pod fails to start with an `ImagePullBackOff` or `ErrImagePull` error, temporarily delete the webhook before deploying:
>
> ```bash
> kubectl delete mutatingwebhookconfigurations/zarf
> helm upgrade --install headlamp ...
> kubectl apply -f zarf-webhook.yaml  # restore the webhook after deploy
> ```
>
> Save the webhook manifest before deleting: `kubectl get mutatingwebhookconfigurations/zarf -o yaml > zarf-webhook.yaml`

### 5. Verify the deployment

Check that the pod is running and the plugin was patched correctly:

```bash
# Wait for rollout
kubectl rollout status deployment/headlamp -n headlamp --timeout=120s

# Verify the init container patched the plugin
POD=$(kubectl get pods -n headlamp -l app.kubernetes.io/name=headlamp -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n headlamp $POD -c headlamp-kubevirt

# Verify the headlamp auth protocol was removed from the plugin
kubectl exec -n headlamp $POD -- grep -o 'wsProtocols:W.\{0,30\}' /headlamp/plugins/kubevirt/main.js
```

The init container log should show `Patched kubevirt plugin to remove headlamp auth protocol`, and the `wsProtocols` line should not contain `headlamp.authorization.k8s.io`.

### 6. Access Headlamp via port-forward

Start a port-forward to reach the Headlamp UI:

```bash
kubectl port-forward -n headlamp svc/headlamp 8080:80 &
```

Open `http://127.0.0.1:8080` in a browser.

### 7. Authenticate

With `unsafeUseServiceAccountToken: true`, Headlamp uses the pod's service account for API calls. To authenticate in the browser, generate a long-lived bearer token:

```bash
kubectl create token headlamp-kubevirt \
  -n headlamp \
  --duration=87600h
```

In the Headlamp UI, paste this token when prompted. You can also verify API access from the command line:

```bash
TOKEN=$(kubectl create token headlamp-kubevirt -n headlamp --duration=1h)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/clusters/default/api/v1/namespaces
```

### 8. Verify the KubeVirt plugin loads

After authenticating in the browser:

1. Check the left sidebar for KubeVirt-specific navigation (Virtual Machines, Virtual Machine Instances, etc.)
2. Open browser DevTools (F12) and check the Console tab for plugin load errors
3. Navigate to the VM list and confirm your VMs appear

If the plugin does not appear, check these in order:

1. Init container logs (step 5)
2. Headlamp logs: `kubectl logs deployment/headlamp -n headlamp --tail=100`
3. Plugin files exist in the pod: `kubectl exec -n headlamp $POD -- ls /headlamp/plugins/kubevirt/`
4. The plugin list endpoint: `curl http://127.0.0.1:8080/plugins` should list `kubevirt`

### 9. Verify VNC console access

Navigate to a VM in the Headlamp UI and click the VNC button.

If VNC shows "VNC connection lost":

1. Open browser DevTools Console (F12) and look for the specific error
2. The most common cause is a cluster name mismatch. Verify the Headlamp startup log shows `"context":"default"`:
   ```bash
   kubectl logs deployment/headlamp -n headlamp | grep '"context"'
   ```
3. Verify the awk patch removed the auth protocol (step 5)
4. Hard-refresh the browser (Ctrl+Shift+R) to clear cached JavaScript

Verify VNC works from the command line:

```bash
TOKEN=$(kubectl create token headlamp-kubevirt -n headlamp --duration=1h)
curl -s -o /tmp/vnc_screenshot.png \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/clusters/default/apis/subresources.kubevirt.io/v1/namespaces/default/virtualmachineinstances/<vm-name>/vnc/screenshot
```

## Troubleshooting

### Problem: Headlamp pod stuck in `ImagePullBackOff`

**Symptom:** The Headlamp pod shows `ImagePullBackOff` or `ErrImagePull` after deployment.

**Solution:** Zarf's MutatingWebhookConfiguration is rewriting the image reference. Delete the webhook, restart the pod, then restore the webhook. See the warning in step 4.

### Problem: VNC shows "VNC connection lost"

**Symptom:** Clicking the VNC button in the Headlamp UI shows a black screen with "VNC connection lost" after a few seconds.

**Solution:** The kubevirt plugin sends an invalid WebSocket subprotocol that causes a client-side error. Check the browser console for `Failed to construct 'WebSocket': The subprotocol '' is invalid` or similar. This indicates the awk patch did not run or did not match. Verify the init container logs and the patched `main.js` in the pod. Hard-refresh the browser after confirming the fix.

### Problem: Headlamp shows 404 for `/clusters/default/...`

**Symptom:** API calls through the Headlamp proxy return 404.

**Solution:** The in-cluster context name does not match what the kubevirt plugin expects. Verify `inClusterContextName` is set to `"default"` in the Helm values and check the Headlamp startup log for the registered context name.

### Problem: "failed to get context" errors in Headlamp logs

**Symptom:** Headlamp logs show `"error":"key not found","message":"failed to get context"` on VNC connection attempts.

**Solution:** This error comes from the `OIDCTokenRefreshMiddleware` and is non-fatal when `unsafeUseServiceAccountToken: true` is set. The middleware logs the error but passes the request through. If VNC still does not work, the issue is likely the cluster name mismatch or the auth protocol patch described above.

### Problem: Plugin does not appear in the Headlamp UI

**Symptom:** The Headlamp UI loads but no KubeVirt navigation appears.

**Solution:** Check that the init container copied the plugin files and that the awk patch did not corrupt `main.js`. The file should start with `(function(){"use strict";...` and contain `registerRoute` calls for kubevirt paths. If the file looks corrupted, the awk pattern may have matched too aggressively. Verify with `kubectl exec -n headlamp $POD -- wc -c /headlamp/plugins/kubevirt/main.js` (should be approximately 1.6 MB).

### Problem: CDI upload pod blocked by Pepr policy

**Symptom:** CDI upload pod creation fails with a policy violation about Istio annotations.

**Solution:** Ensure the Pepr module includes the CDI exception for `sidecar.istio.io/inject` annotations. The exception allows CDI pods (`importer-*`, `cdi-upload-*`, `cdi-clone-*`) to set `sidecar.istio.io/inject: false`. If using a pre-built package, apply the updated Pepr module from the `chance/vm-poc-separation` branch.

### Problem: ztunnel pod fails to start

**Symptom:** ztunnel pod stuck in `ContainerCreating` with `failed to find plugin "istio-cni" in path [/bin]`.

**Solution:** k3s kubelet looks for CNI plugins in `/bin`, but the istio-cni binary installs to `/var/lib/rancher/k3s/data/cni/istio-cni`. Create a symlink:

```bash
docker exec k3d-uds-server-0 ln -sf \
  /var/lib/rancher/k3s/data/cni/istio-cni \
  /bin/istio-cni
```

Then delete the stuck ztunnel pod to trigger a restart.

## Cleaning up

To remove Headlamp from the cluster:

```bash
helm uninstall headlamp -n headlamp
kubectl delete namespace headlamp
kubectl delete clusterrole headlamp-kubevirt-validation
kubectl delete clusterrolebinding headlamp-kubevirt-validation
```

## Related documentation

- [Windows VM deployment](./windows-vm-deployment.md) - Deploying a Windows Server VM with CDI and sysprep
- [UDS VM architecture](./uds-vm-architecture.md) - Architecture decisions for VM support
- [Headlamp KubeVirt plugin](https://github.com/naval-group/headlamp-kubevirt) - Plugin source and documentation
- [Headlamp Helm chart](https://github.com/kubernetes-sigs/headlamp/tree/main/charts/headlamp) - Chart configuration options
