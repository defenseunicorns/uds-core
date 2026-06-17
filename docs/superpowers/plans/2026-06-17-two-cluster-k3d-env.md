# Two-Cluster k3d Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reproducible, shareable two-cluster k3d environment (`hub` + `edge`) with non-overlapping pod/service CIDRs on a shared docker network, ready for Submariner to join.

**Architecture:** A new `tasks/multicluster.yaml` UDS task file (maru-runner, same pattern as `tasks/setup.yaml`). It deploys the `uds-k3d` Zarf package twice with different `CLUSTER_NAME`, host ports, and CIDRs, both on one shared docker network so node containers can route to each other (Submariner's gateway connectivity precondition). Tasks: `up`, `down`, `verify`.

**Tech Stack:** uds-cli (`./uds`), maru tasks, `uds-k3d` Zarf package (`oci://defenseunicorns/uds-k3d:0.20.1-airgap`), k3d v5, k3s, kubectl, docker.

---

## Prerequisites

- `./uds` binary present in repo root (already used by existing tasks).
- `k3d` v5+ installed locally (used for teardown and inspection). Verify: `k3d version`.
- `docker` running.

## CIDR / port plan

k3s defaults: pod CIDR `10.42.0.0/16`, service CIDR `10.43.0.0/16`. Only `edge` overrides.

| Cluster | CLUSTER_NAME | API port | HTTP | HTTPS | pod CIDR | service CIDR |
|---|---|---|---|---|---|---|
| hub  | `hub`  | 6550 | 80   | 443  | 10.42.0.0/16 (default) | 10.43.0.0/16 (default) |
| edge | `edge` | 6551 | 8081 | 8444 | 10.44.0.0/16 | 10.45.0.0/16 |

Shared docker network: `clusterset`. Contexts created by k3d: `k3d-hub`, `k3d-edge`.

## File structure

- Create: `tasks/multicluster.yaml` — all multicluster env tasks. One responsibility: stand up / tear down / verify the two-cluster mesh substrate.
- Modify: `HACKATHON.md` — fill in the real `uds run` command names under "Working with the env".

No existing files change behavior. `tasks/multicluster.yaml` is standalone and run with `uds run -f tasks/multicluster.yaml <task>`.

---

### Task 1: Scaffold the task file with a reusable cluster-create task

**Files:**
- Create: `tasks/multicluster.yaml`

- [ ] **Step 1: Write the task file with the copyright header and a reusable `create-cluster` task**

```yaml
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Two-cluster k3d environment for UDS ClusterSet (Submariner multicluster POC).
# Run with: uds run -f tasks/multicluster.yaml <task>

tasks:
  - name: create-cluster
    description: "Deploy one uds-k3d cluster onto the shared clusterset network"
    inputs:
      name:
        description: "k3d cluster name"
        required: true
      api_port:
        description: "Host port for the k8s API server"
        required: true
      http_port:
        description: "Host port mapped to cluster HTTP"
        required: true
      https_port:
        description: "Host port mapped to cluster HTTPS"
        required: true
      extra_args:
        description: "K3D_EXTRA_ARGS (k3s args for CIDR overrides)"
        default: ""
    actions:
      - description: "Create the shared docker network (idempotent)"
        cmd: docker network create clusterset || true
      - description: "Deploy uds-k3d cluster ${{ .inputs.name }}"
        # renovate: datasource=docker depName=ghcr.io/defenseunicorns/packages/uds-k3d versioning=docker
        cmd: |
          ./uds zarf package deploy oci://defenseunicorns/uds-k3d:0.20.1-airgap \
            --set CLUSTER_NAME=${{ .inputs.name }} \
            --set K3D_NETWORK=clusterset \
            --set K3D_API_PORT=${{ .inputs.api_port }} \
            --set K3D_HTTP_PORT=${{ .inputs.http_port }} \
            --set K3D_HTTPS_PORT=${{ .inputs.https_port }} \
            --set K3D_EXTRA_ARGS="${{ .inputs.extra_args }}" \
            --confirm
```

- [ ] **Step 2: Verify the task file parses and lists**

Run: `uds run -f tasks/multicluster.yaml --list`
Expected: output includes `create-cluster` with its description, no YAML parse error.

- [ ] **Step 3: Commit**

```bash
git add tasks/multicluster.yaml
git commit -m "feat(multicluster): add reusable create-cluster task"
```

---

### Task 2: Add the `up` task (hub + edge)

**Files:**
- Modify: `tasks/multicluster.yaml`

- [ ] **Step 1: Append the `up` task that creates both clusters**

Add under `tasks:` after `create-cluster`:

```yaml
  - name: up
    description: "Bring up hub + edge k3d clusters with non-overlapping CIDRs"
    actions:
      - description: "Create hub (default k3s CIDRs: pod 10.42/16, svc 10.43/16)"
        task: create-cluster
        with:
          name: hub
          api_port: "6550"
          http_port: "80"
          https_port: "443"
      - description: "Create edge (pod 10.44/16, svc 10.45/16 to avoid overlap)"
        task: create-cluster
        with:
          name: edge
          api_port: "6551"
          http_port: "8081"
          https_port: "8444"
          extra_args: '--k3s-arg "--cluster-cidr=10.44.0.0/16@server:*" --k3s-arg "--service-cidr=10.45.0.0/16@server:*"'
      - description: "Show contexts"
        cmd: |
          echo "Clusters up. Contexts: k3d-hub, k3d-edge"
          ./uds zarf tools kubectl config get-contexts
```

- [ ] **Step 2: Run `up`**

Run: `uds run -f tasks/multicluster.yaml up`
Expected: both deploys finish; final output lists contexts `k3d-hub` and `k3d-edge`.

- [ ] **Step 3: Verify both clusters' nodes are Ready**

Run: `./uds zarf tools kubectl get nodes --context k3d-hub`
Expected: at least one node, STATUS `Ready`.

Run: `./uds zarf tools kubectl get nodes --context k3d-edge`
Expected: at least one node, STATUS `Ready`.

- [ ] **Step 4: Commit**

```bash
git add tasks/multicluster.yaml
git commit -m "feat(multicluster): add up task for hub + edge clusters"
```

---

### Task 3: Add the `verify` task (CIDRs distinct + cross-cluster node reachability)

This is the critical correctness check: Submariner fails silently if CIDRs overlap or if
node containers can't reach each other across the docker network.

**Files:**
- Modify: `tasks/multicluster.yaml`

- [ ] **Step 1: Append the `verify` task**

```yaml
  - name: verify
    description: "Assert hub/edge pod CIDRs differ and node containers can reach each other"
    actions:
      - description: "Print hub pod CIDR (expect 10.42.x)"
        cmd: |
          ./uds zarf tools kubectl get nodes --context k3d-hub \
            -o jsonpath='{.items[0].spec.podCIDR}{"\n"}'
      - description: "Print edge pod CIDR (expect 10.44.x) and fail if it overlaps hub"
        cmd: |
          EDGE_CIDR=$(./uds zarf tools kubectl get nodes --context k3d-edge \
            -o jsonpath='{.items[0].spec.podCIDR}')
          echo "edge pod CIDR: $EDGE_CIDR"
          case "$EDGE_CIDR" in
            10.44.*) echo "OK: edge CIDR distinct from hub" ;;
            *) echo "FAIL: edge CIDR not in 10.44/16 — overlap risk"; exit 1 ;;
          esac
      - description: "Cross-cluster node reachability over the clusterset network"
        cmd: |
          EDGE_IP=$(docker inspect k3d-edge-server-0 \
            -f '{{ "{{(index .NetworkSettings.Networks \"clusterset\").IPAddress}}" }}')
          echo "edge node IP on clusterset network: $EDGE_IP"
          docker exec k3d-hub-server-0 ping -c 2 "$EDGE_IP"
```

- [ ] **Step 2: Run `verify`**

Run: `uds run -f tasks/multicluster.yaml verify`
Expected: prints hub CIDR `10.42.0.0/24` (node sub-range of the /16), edge CIDR line ending `OK: edge CIDR distinct from hub`, and `ping` shows `2 packets transmitted, 2 received`.

- [ ] **Step 3: Commit**

```bash
git add tasks/multicluster.yaml
git commit -m "feat(multicluster): add verify task for CIDR + connectivity checks"
```

---

### Task 4: Add the `down` task (teardown)

**Files:**
- Modify: `tasks/multicluster.yaml`

- [ ] **Step 1: Append the `down` task**

```yaml
  - name: down
    description: "Delete hub + edge clusters and the shared network"
    actions:
      - description: "Delete clusters (ignore if already gone)"
        cmd: |
          k3d cluster delete hub || true
          k3d cluster delete edge || true
      - description: "Remove the shared docker network (ignore if in use/gone)"
        cmd: docker network rm clusterset || true
```

- [ ] **Step 2: Run `down`**

Run: `uds run -f tasks/multicluster.yaml down`
Expected: both clusters deleted; network removed (or "ignore" message if already gone).

- [ ] **Step 3: Verify teardown**

Run: `k3d cluster list`
Expected: neither `hub` nor `edge` listed.

- [ ] **Step 4: Commit**

```bash
git add tasks/multicluster.yaml
git commit -m "feat(multicluster): add down task for teardown"
```

---

### Task 5: Full round-trip + document the commands

**Files:**
- Modify: `HACKATHON.md`

- [ ] **Step 1: Clean round-trip from scratch**

Run: `uds run -f tasks/multicluster.yaml down`
Then: `uds run -f tasks/multicluster.yaml up`
Then: `uds run -f tasks/multicluster.yaml verify`
Expected: `up` succeeds from a clean state; `verify` passes all three checks.

- [ ] **Step 2: Update the env command block in `HACKATHON.md`**

Replace the placeholder command block under "Working with the env" with:

```bash
# bring up the two-cluster mesh (hub + edge)
uds run -f tasks/multicluster.yaml up

# verify CIDRs distinct + cross-cluster node reachability
uds run -f tasks/multicluster.yaml verify

# tear down
uds run -f tasks/multicluster.yaml down

# mesh health (after Submariner is joined — Eng2)
subctl show connections
subctl show services
```

- [ ] **Step 3: Mark task #2 done on the HACKATHON.md board**

Change the task #2 row status from `🟡` to `✅`.

- [ ] **Step 4: Commit**

```bash
git add HACKATHON.md
git commit -m "docs(multicluster): document two-cluster env commands"
```

---

## Notes for Eng2 (Submariner) — out of scope for this plan

- Contexts to join: `k3d-hub` (broker + hub), `k3d-edge`.
- CIDRs are non-overlapping, so **Globalnet is not needed** — plain Submariner join.
- Gateway endpoint: node container IP on the `clusterset` network (verified reachable in Task 3).
- Hand the `ServiceExport`/`ServiceImport` CRD YAML to Eng1 once the operator package installs them (spec §8 — mock the seam).

## Self-review

- **Spec coverage:** Implements spec §5.5 (two-cluster k3d env, non-overlapping CIDRs, shareable, k3d-native). Submariner deploy/join (§5.4, §6) is explicitly Eng2/other-repo and out of scope here. Demo app (§5.5 tail) is a separate Eng3 plan.
- **Placeholders:** none — every step has concrete commands and expected output.
- **Consistency:** cluster names (`hub`/`edge`), contexts (`k3d-hub`/`k3d-edge`), network (`clusterset`), CIDRs (10.42/10.44 pod, 10.43/10.45 svc), and container names (`k3d-<name>-server-0`) are used identically across all tasks.

## Open risk to retire during execution

The `docker inspect` Go-template in Task 3 Step 1 is escaped for maru's `${{ }}` templating. If maru mangles it, fall back to a small script file under `hack/` invoked by the task, or run the inspect in CI-free shell. Confirm the rendered command during first run.
