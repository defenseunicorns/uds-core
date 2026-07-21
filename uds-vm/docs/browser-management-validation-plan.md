# Browser management validation plan

This plan is an execution runbook for validating the browser-based VM management requirement in `uds-vm-architecture.md`. The goal is to prove, with repeatable evidence, whether `Headlamp` plus a KubeVirt plugin is a viable iteration 1 path for `uds-vm`.

The agent executing this plan should treat it as a proof exercise, not a productionization exercise. You are not trying to finish the final product here. You are trying to answer whether the browser workflow works, where it breaks, and whether the remaining gaps are small enough to harden inside `uds-vm`.

If this browser path works, the architecture POC should be treated as more or less complete. The runtime, Windows, packaging-direction, and UDS integration groundwork already exist. This plan is intended to prove the last major architectural unknown.

## Validation target

This plan validates the narrow browser workflow that the architecture doc calls for:

- view basic VM inventory and status in a browser
- trigger VM lifecycle actions in a browser
- open a browser console for Linux and Windows VMs
- prove the workflow can coexist with the current `uds-vm` packaging and UDS Core platform boundaries

The validation is successful only if the workflow runs against a real `uds-vm` deployment path, not a disconnected demo.

## Decision this work must produce

At the end of this effort, you must be able to make one of these recommendations with evidence:

1. `Headlamp` plus a KubeVirt plugin is viable for `uds-vm` iteration 1, and the remaining hardening work is bounded.
2. `Headlamp` plus a KubeVirt plugin is not viable inside the UDS constraints, and `uds-vm` needs a narrower product-owned wrapper or different browser path.

You must also make an explicit architecture-POC decision at the end of the run:

1. `Architecture POC validated`
2. `Architecture POC partially validated`
3. `Architecture POC not validated`

## Current baseline

The current `uds-vm` subtree already proves the runtime side of the product:

- `uds-vm/zarf.yaml` builds and deploys `uds-vm`
- `uds-vm/tasks.yaml` provides the repo-root deploy and test tasks
- `uds-vm/k3d-kubevirt-dev/uds-bundle.yaml` consumes published slim-dev core and local `uds-vm`
- `uds-vm/tests/` contains integration coverage for KubeVirt and Istio behavior
- `uds-vm/docs/windows-vm-deployment.md` documents a validated Windows VM path using CDI upload plus `sysprep`

The missing proof is the browser management layer.

## Architecture POC completion criteria

Treat the architecture POC as complete if this validation proves all of the following:

- a browser workflow exists for VM inventory and status
- a browser workflow exists for VM power actions
- a browser workflow exists for console access
- the browser workflow works for both Linux and Windows VMs, or the remaining Windows gap is clearly isolated and small
- the browser workflow operates inside UDS auth, RBAC, and policy boundaries closely enough for a POC
- the browser workflow can be packaged under `uds-vm` without depending on hidden parent-repo assumptions

This is a POC gate, not a production gate. You do not need to finish all hardening work. You do need to prove the architecture direction is sound.

## Candidate to validate first

Validate this path first and treat it as the default candidate unless it fails for a concrete reason:

- **UI shell:** `Headlamp`
- **Plugin candidate:** `naval-group/headlamp-kubevirt`
- **Install pattern:** in-cluster Headlamp Helm deploy plus KubeVirt plugin init container

This is the best current candidate because:

- it already targets KubeVirt directly
- it already exposes VM lifecycle and console workflows
- it can run in-cluster, which matches `uds-vm` packaging expectations better than a desktop-only path

Do not spend time evaluating broader custom UI paths until this path fails with evidence.

## What to collect as evidence

Collect this evidence throughout the run. Do not wait until the end.

- shell transcript or command log for each deployment step
- exact manifests and Helm values used
- screenshots for VM list, VM details, action menus, VNC console, serial console, and permission failures
- pod logs for Headlamp and any plugin init container
- KubeVirt resource state before and after each UI action
- RBAC manifests and `kubectl auth can-i` output
- any UDS policy exceptions or gateway changes required
- explicit gap list with severity, root cause, and workaround status

## Prerequisites

You need these prerequisites before starting:

- a working checkout of the extracted-ready `uds-vm` subtree in `/home/chance/Unicorn/uds-kubevirt/uds-vm`
- `uds` CLI installed and on `PATH`
- `kubectl`, `docker`, `helm`, and `virtctl` installed and on `PATH`
- network access to pull the Headlamp chart and plugin images
- a local k3d-capable host with enough disk and memory for UDS Core, KubeVirt, and one Linux and one Windows VM

You should also confirm these versions before touching the cluster:

```bash
uds version
kubectl version --client
helm version
docker version
virtctl version
```

Record the output in your validation notes.

## High-level execution order

Run the work in this order:

1. Deploy the `uds-vm` baseline cluster.
2. Verify the existing Linux VM smoke path.
3. Verify the existing Windows VM path.
4. Deploy plain Headlamp without the KubeVirt plugin.
5. Verify Headlamp baseline access and logs.
6. Deploy the KubeVirt plugin into Headlamp.
7. Verify VM list, status, lifecycle actions, and console workflows.
8. Validate RBAC and negative cases.
9. Validate whether the deployment shape fits standalone `uds-vm` packaging.
10. Produce recommendation, gaps, and next-step proposal.

## Phase 1: Build the baseline cluster

This phase gets you to a known-good `uds-vm` runtime before any browser work starts.

### Step 1: Start from a clean context

Make sure you are operating in the `uds-vm` subtree and not the parent repo task flow.

```bash
pwd
git status --short
kubectl config current-context
```

Expected result:

- current directory is `/home/chance/Unicorn/uds-kubevirt/uds-vm`
- you understand whether the tree is dirty
- you know which kube context is currently active

### Step 2: Deploy the local k3d validation environment

Use the repo-root task flow, not the old parent-repo commands.

```bash
uds run -f tasks.yaml deploy-k3d --no-progress
```

This task should:

- deploy published `k3d-core-slim-dev`
- build local `uds-vm`
- deploy KubeVirt and CDI
- import container disk images needed for smoke tests
- run the `health-check` task

If this step fails, stop and record:

- failing task name
- command output
- pod status across `istio-system`, `kubevirt`, `cdi`, `zarf`, and any `uds-*` namespaces

Use these commands for first-pass triage:

```bash
uds zarf tools kubectl get pods -A
uds zarf tools kubectl get vm,vmi,dv,pvc -A
uds zarf tools kubectl get events -A --sort-by=.metadata.creationTimestamp
```

### Step 3: Verify KubeVirt and CDI are healthy

Run these checks after `deploy-k3d` completes:

```bash
uds zarf tools kubectl get kubevirt -A
uds zarf tools kubectl get cdi -A
uds zarf tools kubectl get pods -n kubevirt
uds zarf tools kubectl get pods -n cdi
```

Expected result:

- KubeVirt reports `Available`
- CDI reports `Available`
- `virt-api`, `virt-controller`, `virt-handler`, `cdi-apiserver`, `cdi-deployment`, `cdi-operator`, and `cdi-uploadproxy` are healthy

Capture screenshots or terminal output for the final report.

### Step 4: Verify the Linux smoke path

Run the existing VM smoke test from the repo-root task file.

```bash
uds run -f tasks.yaml vm-test --no-progress
```

Then confirm the VM is present and reachable:

```bash
uds zarf tools kubectl get vm,vmi -A
uds zarf tools kubectl get pods -A | grep virt-launcher
```

Expected result:

- a test VM starts successfully
- the VMI reaches `Running`
- the smoke path used by existing `uds-vm` test logic passes cleanly

If this does not work, do not move on to Headlamp yet.

### Step 5: Verify the Windows baseline if available

If you have already uploaded the Windows ISO and created the Windows VM using `windows-vm-deployment.md`, verify it now. If you do not have a Windows VM yet, create one before browser validation so the console workflow can be tested against both guest types.

Use the documented runtime path in `uds-vm/docs/windows-vm-deployment.md`.

Minimum verification commands:

```bash
uds zarf tools kubectl get vm windows-server-2022 -n default
uds zarf tools kubectl get vmi windows-server-2022 -n default -o wide
uds zarf tools kubectl get pod -l kubevirt.io/domain=windows-server-2022 -n default
```

Expected result:

- the Windows VM exists
- the VMI is running
- you have at least one known-good Windows guest for browser-console testing

## Phase 2: Deploy plain Headlamp first

Do not introduce the KubeVirt plugin immediately. First prove that a plain Headlamp deployment works inside the same cluster and that you can reach it consistently.

### Step 1: Create a working namespace

Deploy Headlamp into its own namespace.

```bash
uds zarf tools kubectl create namespace headlamp
```

Expected result:

- namespace `headlamp` exists

### Step 2: Create minimal Helm values for baseline deployment

Start with a port-forwardable, low-complexity baseline. Do not introduce ingress, OAuth, or plugin manager complexity yet.

Create this file:

```yaml title="headlamp-values.yaml"
config:
  watchPlugins: true

service:
  type: ClusterIP
  port: 80

replicaCount: 1

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

This keeps the first deploy simple:

- one replica
- no external exposure yet
- no plugin wiring yet

### Step 3: Install Headlamp with Helm

Use the official Headlamp chart.

```bash
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm repo update
helm upgrade --install headlamp headlamp/headlamp \
  --namespace headlamp \
  --create-namespace \
  -f headlamp-values.yaml
```

Expected result:

- Headlamp deployment, service, and any supporting resources are created in `headlamp`

### Step 4: Verify the plain Headlamp deployment

Run these checks:

```bash
uds zarf tools kubectl get pods -n headlamp
uds zarf tools kubectl get svc -n headlamp
uds zarf tools kubectl logs deployment/headlamp -n headlamp
```

Expected result:

- pod is `Running`
- service exists
- logs do not show startup-loop or permission failures

### Step 5: Access Headlamp through port-forward

Use port-forward first. This removes ingress and auth variables while proving the UI basics.

```bash
uds zarf tools kubectl port-forward -n headlamp svc/headlamp 8080:80
```

Open `http://127.0.0.1:8080` in a browser.

Expected result:

- the Headlamp UI loads
- the UI can talk to the in-cluster API using its service account

### Step 6: Record baseline Headlamp behavior

Before adding the plugin, record:

- whether Headlamp loads at all
- whether Kubernetes resources are visible
- whether logs show API permission issues
- whether there are websocket or proxy errors already present

If plain Headlamp does not work, stop and fix that first. Do not blame the plugin for baseline Headlamp issues.

## Phase 3: Add the KubeVirt plugin

This phase wires in the candidate plugin and proves whether it can see KubeVirt objects.

### Step 1: Use the current plugin candidate

Target this plugin first:

- repository: `https://github.com/naval-group/headlamp-kubevirt`
- plugin image: `ghcr.io/naval-group/headlamp-kubevirt:latest` for initial exploration, then pin a specific release tag once the path proves viable

The plugin README documents an in-cluster install pattern using an init container that copies the built plugin into a shared volume. Use that first because it is simple and does not require Headlamp plugin manager indirection.

### Step 2: Update Helm values to mount the plugin

Create this file or extend the prior file:

```yaml title="headlamp-with-kubevirt-plugin-values.yaml"
config:
  watchPlugins: true

service:
  type: ClusterIP
  port: 80

replicaCount: 1

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

initContainers:
  - name: headlamp-kubevirt
    image: ghcr.io/naval-group/headlamp-kubevirt:latest
    command:
      - /bin/sh
      - -c
    args:
      - cp -r /plugins/kubevirt /headlamp-plugins/
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

This follows the plugin project’s documented in-cluster pattern.

### Step 3: Upgrade the Headlamp release

```bash
helm upgrade --install headlamp headlamp/headlamp \
  --namespace headlamp \
  -f headlamp-with-kubevirt-plugin-values.yaml
```

Expected result:

- the init container runs successfully
- the Headlamp pod restarts cleanly
- the Headlamp container has the plugin mounted under `/headlamp/plugins`

### Step 4: Verify plugin install at the pod level

Run these checks:

```bash
uds zarf tools kubectl get pods -n headlamp
uds zarf tools kubectl logs deployment/headlamp -n headlamp -c headlamp
uds zarf tools kubectl logs deployment/headlamp -n headlamp -c headlamp-kubevirt
```

Then inspect the filesystem inside the Headlamp pod:

```bash
POD=$(uds zarf tools kubectl get pods -n headlamp -o jsonpath='{.items[0].metadata.name}')
uds zarf tools kubectl exec -n headlamp "$POD" -c headlamp -- ls -R /headlamp/plugins
```

Expected result:

- a `kubevirt` plugin directory exists
- it contains at least `main.js` and `package.json`
- Headlamp logs do not show plugin parse or load failures

### Step 5: Reload the UI and verify the plugin appears

With the port-forward still active, reload `http://127.0.0.1:8080`.

Record:

- whether KubeVirt-specific navigation appears
- whether VM resources show up without browser console errors
- whether any plugin panels fail to load in the browser dev tools console

If the plugin does not appear:

1. check init container logs
2. check Headlamp logs
3. check plugin files inside the pod
4. pin a specific plugin version instead of `latest`
5. verify Headlamp version meets the plugin’s documented minimum (`>= 0.24.0` in the current README)

## Phase 4: Fix RBAC before judging the UX

Do not judge the plugin before RBAC is correct. KubeVirt subresources for VNC, console, and lifecycle operations require explicit permissions.

### Step 1: Check current permissions first

Start by finding which service account the Headlamp deployment uses:

```bash
uds zarf tools kubectl get deployment headlamp -n headlamp -o jsonpath='{.spec.template.spec.serviceAccountName}'
```

Then inspect existing permissions:

```bash
uds zarf tools kubectl auth can-i list virtualmachines --api-group=kubevirt.io \
  --as system:serviceaccount:headlamp:default -A
uds zarf tools kubectl auth can-i list virtualmachineinstances --api-group=kubevirt.io \
  --as system:serviceaccount:headlamp:default -A
uds zarf tools kubectl auth can-i get virtualmachineinstances/vnc --api-group=subresources.kubevirt.io \
  --as system:serviceaccount:headlamp:default -A
```

If the deployment uses a non-default service account, substitute that name.

### Step 2: Create a focused validation RBAC set

Use a dedicated service account and cluster role for the validation so you can see exactly what Headlamp needs.

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
  - apiGroups:
      - ""
    resources:
      - pods
      - pods/log
      - persistentvolumeclaims
      - events
      - services
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

Apply it:

```bash
uds zarf tools kubectl apply -f headlamp-kubevirt-rbac.yaml
```

### Step 3: Point the Headlamp deployment at the dedicated service account

Patch the deployment:

```bash
uds zarf tools kubectl patch deployment headlamp -n headlamp \
  --type merge \
  -p '{"spec":{"template":{"spec":{"serviceAccountName":"headlamp-kubevirt"}}}}'
```

Wait for rollout:

```bash
uds zarf tools kubectl rollout status deployment/headlamp -n headlamp
```

### Step 4: Verify permissions explicitly

Use `kubectl auth can-i` against the new service account:

```bash
uds zarf tools kubectl auth can-i list virtualmachines --api-group=kubevirt.io \
  --as system:serviceaccount:headlamp:headlamp-kubevirt -A

uds zarf tools kubectl auth can-i update virtualmachines/start --api-group=subresources.kubevirt.io \
  --as system:serviceaccount:headlamp:headlamp-kubevirt -A

uds zarf tools kubectl auth can-i get virtualmachineinstances/vnc --api-group=subresources.kubevirt.io \
  --as system:serviceaccount:headlamp:headlamp-kubevirt -A
```

If these checks fail, fix RBAC before performing UI testing.

## Phase 5: Validate the browser workflow itself

This phase is the core proof. Run it against both a Linux VM and the validated Windows VM if possible.

## Test matrix

Use this matrix and fill in pass, fail, notes, screenshots, and follow-up for each cell.

| Workflow | Linux VM | Windows VM | Evidence required |
|---|---|---|---|
| VM list visible | Pass/Fail | Pass/Fail | screenshot + resource names |
| VM details visible | Pass/Fail | Pass/Fail | screenshot + fields shown |
| Start action works | Pass/Fail | Pass/Fail | UI screenshot + `kubectl get vm,vmi` before/after |
| Stop action works | Pass/Fail | Pass/Fail | UI screenshot + `kubectl get vm,vmi` before/after |
| Restart action works | Pass/Fail | Pass/Fail | UI screenshot + timestamps/events |
| VNC console opens | Pass/Fail | Pass/Fail | screenshot/video + logs |
| Serial console opens | Pass/Fail | N/A or Pass/Fail | screenshot/video + logs |
| Permission denial behaves correctly | Pass/Fail | Pass/Fail | screenshot + log/error message |

### Step 1: Validate VM inventory and details

From the browser:

1. open the KubeVirt or VM area in Headlamp
2. locate the Linux test VM
3. locate the Windows VM
4. open the details page for each

Confirm the UI shows at least:

- VM name
- namespace
- power state
- VMI state
- node placement
- CPU and memory summary if available

Cross-check with CLI:

```bash
uds zarf tools kubectl get vm,vmi -A -o wide
```

Record any fields missing from the UI that are required by the architecture doc.

### Step 2: Validate start, stop, and restart actions

For each VM, run this sequence:

1. stop the VM from the UI
2. confirm the UI updates
3. confirm CLI state matches
4. start the VM from the UI
5. confirm the UI updates
6. confirm CLI state matches
7. restart the VM from the UI if the plugin supports it

Use these CLI checks after each action:

```bash
uds zarf tools kubectl get vm <vm-name> -n <namespace> -o yaml
uds zarf tools kubectl get vmi <vm-name> -n <namespace> -o yaml
uds zarf tools kubectl get events -n <namespace> --sort-by=.metadata.creationTimestamp
```

Expected result:

- the UI action causes the expected KubeVirt state transition
- no hidden CLI repair step is needed
- the errors, if any, are understandable

### Step 3: Validate browser console access for Linux

Start with Linux because it removes Windows-specific interpretation noise.

For Linux:

1. open the VNC console if the plugin offers it
2. verify the screen renders in-browser
3. send keyboard input
4. confirm the guest reacts
5. if the plugin also offers a serial console, test that path too

Use CLI correlation while testing:

```bash
uds zarf tools kubectl logs deployment/headlamp -n headlamp --tail=200
uds zarf tools kubectl get events -A --sort-by=.metadata.creationTimestamp | tail -n 50
```

Expected result:

- browser console opens without needing `virtctl`
- keyboard interaction works
- the console path does not break under port-forwarded access

### Step 4: Validate browser console access for Windows

Repeat the same flow for the Windows VM.

For Windows specifically, verify:

- the VNC console renders the Windows desktop or login screen
- keyboard input works inside the browser console
- the plugin or browser path does not regress the previously validated Windows setup

If the plugin exposes send-key actions, test at least:

- `Ctrl+Alt+Del`
- simple password input

Expected result:

- Windows is controllable from the browser path without dropping back to `virsh send-key`

If the Windows path fails while Linux works, record that separately. That is a real gap, not a generic console failure.

### Step 5: Validate negative cases

Run these negative tests:

1. try to open a console to a stopped VM
2. try to stop a VM that is already stopped
3. remove the start or VNC permission from the service account and confirm the UI fails cleanly

For the permission test, patch the cluster role temporarily or create a narrower binding. Then verify the UI behavior and restore the original RBAC set.

What you are testing here:

- errors are visible and actionable
- failures do not look like blank screens or silent browser breakage
- the logs make the root cause obvious

## Phase 6: Validate exposure and UDS integration fit

Port-forward proves the local workflow. This phase answers whether the path fits the UDS platform model.

### Step 1: Decide whether ingress is required for the validation

You do not need full production auth and routing to prove viability. But you do need enough exposure testing to understand whether:

- Headlamp can sit behind a UDS-style HTTP path
- websocket console traffic still works
- no unexpected Istio, gateway, or policy behavior appears

For this validation, use one of these two levels and record which one you chose:

1. **Minimum viable exposure:** keep Headlamp behind `kubectl port-forward` only.
2. **Better fit check:** expose Headlamp behind a temporary in-cluster ingress or UDS-compatible route and verify websocket console traffic there too.

If time is limited, do level 1 first and level 2 only after the core browser workflow works.

### Step 2: Check whether Headlamp requires any new UDS policy exceptions

Look for:

- privileged pod requirements
- hostPath mounts
- non-standard pod annotations
- service types not allowed by policy

Run these checks:

```bash
uds zarf tools kubectl get deploy,po,svc,sa,role,rolebinding,clusterrole,clusterrolebinding -n headlamp -o yaml > headlamp-resources.yaml
uds zarf tools kubectl describe pod -n headlamp
```

Expected result:

- Headlamp itself should not require the same class of exemptions KubeVirt requires
- any exception required should be narrow and easy to explain

### Step 3: Check logs and observability basics

At minimum, verify that failures appear in:

- Headlamp pod logs
- Kubernetes events
- browser console if the failure is client-side

Use these commands:

```bash
uds zarf tools kubectl logs deployment/headlamp -n headlamp --tail=500 > headlamp.log
uds zarf tools kubectl get events -A --sort-by=.metadata.creationTimestamp > cluster-events.log
```

If the plugin relies on Prometheus-backed metrics, record whether metrics panels work. Missing metrics is not an immediate rejection unless the first-iteration requirement depends on them.

## Phase 7: Validate standalone `uds-vm` packaging fit

This phase checks whether the result can actually live in the extracted repo and not only in an ad hoc cluster.

### Step 1: Decide packaging shape

Pick the smallest viable packaging home and justify it. Evaluate these options in order:

1. add Headlamp as an optional component under `uds-vm/`
2. create a sibling package under `uds-vm/` just for browser management
3. keep it out of package scope and document it as a validation-only overlay if packaging is not yet justified

The evaluation should consider:

- image ownership
- chart ownership
- plugin artifact pinning
- CI cost
- whether the browser path is optional or core to iteration 1

### Step 2: Create a throwaway local deployment shape

You do not need to commit production packaging in this phase, but you should prove whether packaging is straightforward.

At minimum, prepare:

- one Headlamp Helm values file
- one RBAC manifest
- one short deployment note showing where these would live under `uds-vm`

If the deployment requires many repo-specific hacks, record that as a packaging red flag.

### Step 3: Decide the smallest CI signal

You are not required to automate full browser E2E in this phase. You do need to recommend what CI should protect.

Minimum acceptable CI recommendation:

- Headlamp values or manifests render cleanly
- plugin image reference is pinned and reachable
- extracted `uds-vm` deploy path still completes

Better CI recommendation if the path proves strong:

- deploy Headlamp in the existing `test-k3d` workflow
- confirm Headlamp pod becomes ready
- confirm plugin files are present in the container
- optionally run one lightweight API-level assertion against VM visibility

## Explicit success criteria

The browser requirement is validated only if all of these are true:

- Headlamp deploys cleanly into the same cluster used for `uds-vm` validation.
- The KubeVirt plugin loads in the browser.
- The UI shows at least one Linux VM and one Windows VM.
- Start, stop, and restart actions work from the UI and match KubeVirt resource state.
- Browser console access works for Linux.
- Browser console access works for Windows, or the exact blocker is isolated with evidence.
- The required RBAC set is understood and documented.
- The deployment does not require broad, surprising, or high-risk platform exceptions.
- You can explain where this would live in the standalone `uds-vm` repo.

If all of the above are true, the default outcome should be `Architecture POC validated`.

## Explicit failure conditions

Recommend against this path if any of these are true and you cannot contain them with small follow-up work:

- plugin cannot reliably load in-cluster
- UI cannot perform required VM lifecycle actions
- browser console path is fundamentally incompatible with the deployment model
- RBAC required is too broad for acceptable tenancy boundaries
- the path requires heavy parent-repo or `uds-core` coupling to ship
- the operator workflow is too confusing or unstable for iteration 1

If some of the browser workflow works but one or more required architecture outcomes remain unproven, use `Architecture POC partially validated` and list the exact blockers.

If the core browser workflow fails in a way that breaks the architecture direction, use `Architecture POC not validated`.

## POC completion checklist

Fill this out at the end of the run. Do not leave it implied.

| Check | Status | Evidence |
|---|---|---|
| `uds-vm` baseline cluster deployed | Pass/Fail | command output |
| KubeVirt and CDI healthy | Pass/Fail | pod and CR status |
| Linux validation VM available | Pass/Fail | `vm` and `vmi` output |
| Windows validation VM available | Pass/Fail | `vm` and `vmi` output |
| Headlamp deployed | Pass/Fail | Helm output + pod status |
| KubeVirt plugin loaded in Headlamp | Pass/Fail | plugin files + UI screenshot |
| Linux VM visible in browser | Pass/Fail | UI screenshot |
| Windows VM visible in browser | Pass/Fail | UI screenshot |
| Linux start/stop/restart works in browser | Pass/Fail | UI + CLI state correlation |
| Windows start/stop/restart works in browser | Pass/Fail | UI + CLI state correlation |
| Linux browser console works | Pass/Fail | screenshot or recording |
| Windows browser console works | Pass/Fail | screenshot or recording |
| RBAC behavior validated | Pass/Fail | `kubectl auth can-i` + negative test |
| New policy exceptions acceptable for POC | Pass/Fail | manifest and rationale |
| Packaging home inside `uds-vm` identified | Pass/Fail | recommendation |
| Architecture POC decision recorded | Pass/Fail | final recommendation section |

## Final decision rules

Use these rules so the final answer is binary and consistent:

- **Architecture POC validated**
  - Use this only if the checklist is effectively green for the core browser workflows.
  - Minor polish gaps are allowed.
  - Follow-up work may remain, but it must look like hardening, packaging cleanup, or UX narrowing, not architectural uncertainty.

- **Architecture POC partially validated**
  - Use this if the core path basically works but one meaningful requirement is still unproven.
  - Examples: Linux browser console works but Windows browser console is still blocked; inventory works but lifecycle action authorization is still unclear.
  - You must list the exact unresolved items and whether they seem small, medium, or large.

- **Architecture POC not validated**
  - Use this if the chosen browser path fails to prove the architecture direction.
  - Examples: plugin cannot reliably load, browser console is fundamentally broken in the deployment model, or the required permissions and platform changes are too broad.
  - You must explain whether the architecture should pivot to a product-owned wrapper or a different browser surface.

## Recommended report format for the final answer

When the agent finishes, the output should use this structure:

1. **Recommendation**
2. **What was deployed**
3. **What worked**
4. **What failed**
5. **RBAC and security implications**
6. **Packaging fit inside `uds-vm`**
7. **POC completion checklist**
8. **Architecture POC decision**
9. **Required follow-up work**
10. **Go / no-go for iteration 1**

## Related documentation

- `uds-vm-architecture.md` for the product direction and first-iteration scope
- `windows-vm-deployment.md` for the validated Windows runtime path
