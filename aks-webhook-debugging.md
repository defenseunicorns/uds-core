# AKS Webhook Debugging

## Background

Intermittent AKS CI failures with `connection reset by peer` and `EOF` errors on Pepr admission webhook calls. The API server calls the Pepr webhook at `https://pepr-uds-core.pepr-system.svc:443/mutate|validate/...` and the connection is dropped before a response is received.

---

## Root Causes Identified

### 1. ztunnel XDS on-demand lookup latency (FIXED)

When the Kubernetes API server (a non-mesh source) connects to a Pepr admission pod (a mesh destination), ztunnel fires an on-demand XDS workload lookup for the source IP. This lookup takes ~6 seconds and is never cached -- it repeats for every connection. Under load, multiple concurrent webhook calls each paying a 6-10 second penalty causes konnectivity's timeout to fire, resulting in `connection reset by peer`.

**Fix**: Add `istio.io/dataplane-mode: none` pod label to admission pods only (via `admission.podLabels` in `values.yaml`). This excludes admission pods from ztunnel interception entirely. Watcher/operator pods remain in ambient so the operator can still manage keycloak egress resources.

### 2. Node.js `keepAliveTimeout` mismatch (PARTIALLY FIXED)

Node.js HTTPS server defaults to a 5-second `keepAliveTimeout`. After 5 seconds of idle, it closes the connection with FIN. The Kubernetes API server pools webhook connections and reuses them -- if it tries to reuse a connection that Pepr has already closed, it gets EOF.

This is confirmed by log analysis: gaps of 5-6 seconds between requests on a Pepr pod → EOF reported by the API server on the next request.

**Fix**: Set `server.keepAliveTimeout = 75000` (75s) and `server.headersTimeout = 76000` (76s) in Pepr's `controller/index.ts`. These are exposed as `PEPR_KEEP_ALIVE_TIMEOUT` and `PEPR_HEADERS_TIMEOUT` env vars. A Pepr PR has been opened on branch `chance/keepalive-server-configuration`. The env vars are set in `admission.env` in `values.yaml` but have no effect until the Pepr PR is merged and released.

### 3. konnectivity tunnel instability (FIXED by removing overlay)

With `network_plugin_mode = "overlay"`, AKS routes API server → pod webhook calls through konnectivity. The konnectivity tunnel itself becomes briefly unstable during heavy deploy load, causing connection resets to both Pepr AND istiod simultaneously.

**Fix**: Removed `network_plugin_mode = "overlay"` from `main.tf`. Without overlay, AKS uses traditional Azure CNI where the API server connects directly to pod IPs -- no konnectivity in path. This is appropriate for CI since we're not in the business of configuring cloud providers.

### 4. Unknown: idle connection closure from Azure network stack (UNRESOLVED)

Even with konnectivity removed and `keepAliveTimeout=75000ms` confirmed active, EOF errors still occur on connections that were idle for ~20 seconds -- well under the 75s Node.js timeout. The Pepr pods are actively processing requests and show no errors. ztunnel has no entries for these connections (correctly excluded). Azure NPM logs don't capture enforcement events so we can't confirm.

Hypothesis: Azure NPM (network policy enforcement via iptables) flushes connection tracking entries when applying new NetworkPolicies during deployment. When the UDS operator reconciles UDS Packages, it creates Kubernetes NetworkPolicies, which azure-npm translates to iptables rules. Updating iptables conntrack can reset existing TCP connections. This happens during active Helm chart deployment when many resources are being created simultaneously.

No fix found yet. TCP socket-level keepalive probes (`socket.setKeepAlive(true, interval)`) in Pepr may help by preventing intermediate devices from treating the connection as idle, but this has not been tested.

---

## Experiment History

### Experiment 1 -- Restart konnectivity-agents before deploy

**Change**: Added `aks-konnectivity-restart` task to restart konnectivity-agent deployment before deploying core bundle.

**Result**: Failed -- same `connection reset by peer` pattern. Konnectivity became unstable again during deployment.

**Learned**: Not a stale state problem. Konnectivity becomes unstable in response to webhook call load during deploy.

---

### Experiment 2 -- 1:1 node/konnectivity autoscaler patch

**Change**: Patched `konnectivity-agent-autoscaler` configmap to force one replica per node (3 replicas across 3 nodes).

**Result**: Failed -- 3 initial passes then 2 back-to-back failures.

**Learned**: Replica count and topology don't prevent konnectivity instability under load.

---

### Experiment 3 -- Remove overlay CNI (first attempt)

**Change**: Removed `network_plugin_mode = "overlay"` from `main.tf`.

**Result**: Upstream passed with zero connection resets. Registry1 had one EOF failure. **Prematurely ruled out** -- the registry1 failure was a separate Pepr startup race (API server 429 throttling), not the same mechanism.

**Learned**: Removing konnectivity eliminates the RST pattern. Overlay was incorrectly re-added after misidentifying the registry1 failure.

---

### Experiment 4 -- Increase webhook timeout to 30s

**Change**: `"webhookTimeout": 30` in `package.json`. Overlay re-added (konnectivity back).

**Result**: Failed -- ztunnel XDS lookup tail latencies can exceed 30s.

**Learned**: Timeout increase alone is insufficient. The XDS on-demand lookup mechanism is the root cause of latency.

---

### Experiment 5 -- Remove entire pepr-system namespace from ambient mesh

**Change**: Changed pepr-system namespace label to `istio.io/dataplane-mode: none`. Modified `pepr-istio-config.yaml`, `src/pepr/zarf.yaml`, `src/istio/common/zarf.yaml`.

**Result**: Failed with a new regression -- operator logged `"Failed to reconcile ambient egress resources"` for keycloak. EOFs still occurred.

**Learned**: Can't remove all of pepr-system from ambient -- watcher/operator pods need ambient to manage keycloak egress. Also confirmed Node.js `keepAliveTimeout` as a second failure mode.

---

### Experiment 6 -- NODE_DEBUG=http diagnostics

**Change**: Added `NODE_DEBUG=http` env var to Pepr admission pods.

**Result**: Failed -- output went to stderr, not captured in logs. Unhelpful.

**Learned**: ztunnel logs are more useful than Node.js HTTP debug output for diagnosing connection-level failures.

---

### Experiment 7 -- Pod label `istio.io/dataplane-mode: none` on admission pods only

**Change**: Added `podLabels: { istio.io/dataplane-mode: none }` to `admission:` section in `values.yaml`. Watcher/operator pods left in ambient. Overlay restored.

**Result**: Significant improvement -- 4/6 runs passing. ztunnel confirmed zero inbound entries for admission pods. Remaining failures are intermittent idle-gap EOFs.

**Learned**: Surgical exclusion of admission pods from ztunnel works and preserves operator functionality. Remaining failures are the Node.js `keepAliveTimeout` issue.

---

### Experiment 8 -- keepAliveTimeout fix + remove overlay permanently

**Changes**:
- Built custom Pepr image with `server.keepAliveTimeout` and `server.headersTimeout` configurable via `PEPR_KEEP_ALIVE_TIMEOUT` / `PEPR_HEADERS_TIMEOUT` env vars
- Added those env vars to `admission.env` in `values.yaml` (set to 75000ms / 76000ms)
- Removed `network_plugin_mode = "overlay"` from `main.tf` permanently
- `PEPR_CUSTOM_IMAGE` set in workflow to use custom image for testing (must be removed before merge)

**Results**:
- Upstream run: keepAlive confirmed 75000ms active. Core deploy passed. Test-app deploy failed -- RST attributed to konnectivity (overlay was still present for this run)
- Upstream run: AKS internal `aks-webhook-admission-controller` DNS flake -- unrelated to our changes
- Registry1 run (overlay removed): keepAlive confirmed 75000ms. EOF during test-app deploy. Gap only 2.6s -- NOT a keepAliveTimeout issue. Correlated with ztunnel RBAC update pushed to all nodes ~2s before failure
- Registry1 run (overlay removed): keepAlive confirmed 75000ms. EOF during **core deploy** (keycloak). Gap of 20.1 seconds -- under the 75s keepAlive. Pepr pods actively processing. No ztunnel entries. Watcher reconnection storm at `22:09:10` (two 30-second watch connections dropped simultaneously) preceded the gap

**Learned**: 
- keepAliveTimeout fix correctly handles the 5s idle-gap failure mode
- A new failure mode exists where connections are closed by something in the Azure network stack after ~20s, unrelated to Node.js or ztunnel
- The watcher dropping and reconnecting watch connections may trigger a cascade that causes a brief traffic pause to admission, during which the API server's reused connection goes stale

---

## Current State of the Branch

| File | Change | Status |
|------|--------|--------|
| `src/pepr/values.yaml` | `admission.podLabels: istio.io/dataplane-mode: none` | Keep -- fixes ztunnel XDS latency |
| `src/pepr/values.yaml` | `PEPR_KEEP_ALIVE_TIMEOUT=75000`, `PEPR_HEADERS_TIMEOUT=76000` | Keep -- has no effect until Pepr PR merges |
| `.github/test-infra/azure/aks/main.tf` | Removed `network_plugin_mode = "overlay"` | Keep -- removes konnectivity from path |
| `.github/workflows/test-aks.yaml` | `PEPR_CUSTOM_IMAGE=ttl.sh/pepr-keepalive-fix-55de7a7:24h` | **Remove before merge** -- test only |
| `.github/workflows/test-aks.yaml` | Matrix `[upstream, registry1]` | Keep |

---

## Open Questions

1. **What is closing connections after ~20s?** Azure NPM iptables conntrack flush during NetworkPolicy updates is the leading hypothesis. Could also be the AKS API server itself closing idle webhook connections. No tooling in the current debug output captures this.

2. **Would TCP socket keepalive probes help?** Setting `socket.setKeepAlive(true, 5000)` on each incoming connection in Pepr would send TCP keepalive probes every 5 seconds during idle, preventing intermediate devices from treating the connection as idle. This would require another Pepr upstream change.

3. **Should the Pepr keepAlive PR be fast-tracked?** The `PEPR_KEEP_ALIVE_TIMEOUT` env vars in `values.yaml` do nothing with the stock Pepr image. The PR needs to merge and a new Pepr version released before this fix is functional.

4. **Is the remaining failure rate acceptable?** Core deployment is passing consistently. Remaining failures are in test-app deployment during periods of high cluster activity. This may be an inherent AKS behavior we cannot fully eliminate.
