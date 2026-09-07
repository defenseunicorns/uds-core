#!/bin/bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

readonly MARKER='checkpoint.uds.dev/suspended'
readonly VALUE='true'
readonly TIMEOUT='180s'
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
readonly ZARF="${SCRIPT_DIR}/zarf"

kubectl() { "$ZARF" tools kubectl "$@"; }
yq() { "$ZARF" tools yq "$@"; }

context() {
  local current
  current=$(kubectl config current-context)
  case "$current" in k3d-*) echo "$current" ;; *) echo "error: current context is not K3d: ${current}" >&2; return 1 ;; esac
}

wait_for_api() {
  local ctx=$1 attempt
  for attempt in $(seq 1 30); do
    kubectl --context "$ctx" version --request-timeout=5s >/dev/null 2>&1 && return
    sleep 2
  done
  echo "error: API did not become available for ${ctx}" >&2
  return 1
}

# Controller rows: kind, namespace, name, replicas, generation, phase, marker.
controllers=''
replica_sets=''

discover() {
  local ctx=$1 inventory
  inventory=$(kubectl --context "$ctx" get deployments,statefulsets,daemonsets,replicasets -A -o json)
  controllers=$(printf '%s' "$inventory" | yq -r '
    def phase:
      .metadata.namespace as $namespace |
      (.spec.template.metadata.labels."pepr.dev/controller" // "") as $role |
      if $namespace == "kube-system" or $namespace == "zarf" or $namespace == "istio-system" then "infrastructure"
      elif $namespace == "pepr-system" and ($role == "admission" or $role == "watcher") then $role
      else "application" end;
    .items[] | select(.kind != "ReplicaSet") |
    [(.kind | downcase), .metadata.namespace, .metadata.name, (.spec.replicas // 1), .metadata.generation, phase, (.spec.template.spec.nodeSelector."checkpoint.uds.dev/suspended" // "")] | @tsv')
  replica_sets=$(printf '%s' "$inventory" | yq -r '
    def phase:
      .metadata.namespace as $namespace |
      (.spec.template.metadata.labels."pepr.dev/controller" // "") as $role |
      if $namespace == "kube-system" or $namespace == "zarf" or $namespace == "istio-system" then "infrastructure"
      elif $namespace == "pepr-system" and ($role == "admission" or $role == "watcher") then $role
      else "application" end;
    .items as $items |
    $items[] | select(.kind == "ReplicaSet") | . as $replica_set |
    (.metadata.ownerReferences[]? | select(.controller == true and .kind == "Deployment") | .name) as $owner |
    $items[] | select(.kind == "Deployment" and .metadata.namespace == $replica_set.metadata.namespace and .metadata.name == $owner) |
    ["replicaset", $replica_set.metadata.namespace, $replica_set.metadata.name, 1, 0, phase, ($replica_set.spec.template.spec.nodeSelector."checkpoint.uds.dev/suspended" // "")] | @tsv')
}

all_workloads() { printf '%s\n%s\n' "$controllers" "$replica_sets"; }

is_managed() {
  local kind=$1 namespace=$2 name=$3
  all_workloads | awk -F '\t' -v kind="$kind" -v namespace="$namespace" -v name="$name" '$1 == kind && $2 == namespace && $3 == name { found = 1 } END { exit !found }'
}

require_bootstrap() {
  local required role
  for required in 'deployment istio-system istiod' 'daemonset istio-system istio-cni-node' 'daemonset istio-system ztunnel'; do
    printf '%s\n' "$controllers" | awk -F '\t' -v kind="${required%% *}" -v namespace="$(printf '%s' "$required" | cut -d' ' -f2)" -v name="${required##* }" '$1 == kind && $2 == namespace && $3 == name { found = 1 } END { exit !found }' || {
      echo "error: required infrastructure workload missing: ${required}" >&2; return 1;
    }
  done
  for role in admission watcher; do
    printf '%s\n' "$controllers" | awk -F '\t' -v role="$role" '$2 == "pepr-system" && $6 == role { found = 1 } END { exit !found }' || {
      echo "error: required Pepr ${role} workload missing" >&2; return 1;
    }
  done
}

patch() {
  local ctx=$1 action=$2 kind=$3 namespace=$4 name=$5
  if [ "$action" = add ]; then
    kubectl --context "$ctx" -n "$namespace" patch "$kind" "$name" --type=strategic \
      -p "{\"spec\":{\"template\":{\"spec\":{\"nodeSelector\":{\"${MARKER}\":\"${VALUE}\"}}}}}" >/dev/null
  else
    kubectl --context "$ctx" -n "$namespace" patch "$kind" "$name" --type=json \
      -p "[{\"op\":\"remove\",\"path\":\"/spec/template/spec/nodeSelector/${MARKER//\//~1}\"}]" >/dev/null
  fi
}

active_pods() {
  kubectl --context "$1" get pods -A -o json | yq -r '
    .items[] | select(.status.phase == "Pending" or .status.phase == "Running") |
    [.metadata.namespace, .metadata.name, ((.metadata.ownerReferences[]? | select(.controller == true) | .kind) // ""), ((.metadata.ownerReferences[]? | select(.controller == true) | .name) // ""), (.metadata.annotations."kubernetes.io/config.mirror" // "")] | @tsv'
}

validate_active_workloads() {
  local ctx=$1 jobs pods namespace name owner_kind owner_name mirror kind
  jobs=$(kubectl --context "$ctx" get jobs -A -o json | yq -r '.items[] | [.metadata.namespace, .metadata.name, (.status.active // 0)] | @tsv' | awk -F '\t' 'NF == 3 && $1 != "" && $2 != "" && $3 > 0 { print $1 "/" $2 }')
  [ -z "$jobs" ] || { echo "error: active unsupported Jobs: ${jobs}" >&2; return 1; }
  pods=$(active_pods "$ctx")
  while IFS=$'\t' read -r namespace name owner_kind owner_name mirror; do
    [ -z "$namespace" ] || [ -n "$mirror" ] && continue
    kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
    is_managed "$kind" "$namespace" "$owner_name" || { echo "error: active unsupported pod: ${namespace}/${name}" >&2; return 1; }
  done <<EOF
$pods
EOF
}

mark_workloads() {
  local ctx=$1 kind namespace name _ _ _ marker
  while IFS=$'\t' read -r kind namespace name _ _ _ marker; do
    [ -z "$kind" ] && continue
    [ "$marker" = "$VALUE" ] && continue
    [ -z "$marker" ] || { echo "error: unexpected ${MARKER} on ${kind}/${namespace}/${name}" >&2; return 1; }
    patch "$ctx" add "$kind" "$namespace" "$name"
  done <<EOF
$(all_workloads)
EOF
}

delete_managed_pods() {
  local ctx=$1 pods namespace name owner_kind owner_name mirror kind
  pods=$(active_pods "$ctx")
  while IFS=$'\t' read -r namespace name owner_kind owner_name mirror; do
    [ -z "$namespace" ] || [ -n "$mirror" ] && continue
    kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
    is_managed "$kind" "$namespace" "$owner_name" && kubectl --context "$ctx" -n "$namespace" delete pod "$name" --wait=false >/dev/null
  done <<EOF
$pods
EOF
}

suspend() {
  local ctx=$1 attempt pods namespace name owner_kind owner_name mirror kind found
  for attempt in $(seq 1 30); do
    discover "$ctx"
    mark_workloads "$ctx"
    discover "$ctx"
    validate_active_workloads "$ctx"
    delete_managed_pods "$ctx"
    found=0
    pods=$(active_pods "$ctx")
    while IFS=$'\t' read -r namespace name owner_kind owner_name mirror; do
      [ -z "$namespace" ] || [ -n "$mirror" ] && continue
      kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
      is_managed "$kind" "$namespace" "$owner_name" && found=1
    done <<EOF
$pods
EOF
    [ "$found" = 0 ] && return
    sleep 2
  done
  echo 'error: suspended Pods did not disappear' >&2
  return 1
}

wait_for_rollout() {
  local ctx=$1 kind=$2 namespace=$3 name=$4 replicas=$5 generation=$6 desired
  if [ "$kind" = daemonset ]; then
    desired=$(kubectl --context "$ctx" -n "$namespace" get daemonset "$name" -o json | yq -r '.status.desiredNumberScheduled // 0')
  else
    desired=$replicas
  fi
  [ "$desired" = 0 ] && return
  kubectl --context "$ctx" -n "$namespace" wait "$kind/$name" --for="jsonpath={.status.observedGeneration}=${generation}" --timeout="$TIMEOUT"
  kubectl --context "$ctx" -n "$namespace" rollout status "$kind/$name" --timeout="$TIMEOUT"
}

release() {
  local ctx=$1 phase=$2 kind namespace name replicas generation current marker
  discover "$ctx"
  while IFS=$'\t' read -r kind namespace name replicas generation current marker; do
    [ "$current" = "$phase" ] || continue
    [ -z "$marker" ] && continue
    [ "$marker" = "$VALUE" ] || { echo "error: unexpected ${MARKER} on ${kind}/${namespace}/${name}" >&2; return 1; }
    patch "$ctx" remove "$kind" "$namespace" "$name"
  done <<EOF
$(all_workloads)
EOF
  discover "$ctx"
  while IFS=$'\t' read -r kind namespace name replicas generation current marker; do
    [ "$current" = "$phase" ] || continue
    [ -z "$marker" ] || { echo "error: ${kind}/${namespace}/${name} remained suspended" >&2; return 1; }
    wait_for_rollout "$ctx" "$kind" "$namespace" "$name" "$replicas" "$generation"
  done <<EOF
$controllers
EOF
}

restore() {
  local ctx=$1 namespace selector pods
  release "$ctx" infrastructure
  release "$ctx" admission
  kubectl --context "$ctx" create --request-timeout=5s --dry-run=server -o name -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  generateName: pepr-admission-probe-
  namespace: default
spec:
  ports:
    - port: 443
EOF
  release "$ctx" watcher
  release "$ctx" application
  for namespace_selector in 'keycloak app.kubernetes.io/name=keycloak' 'pepr-system app=pepr-uds-core' 'pepr-system app=pepr-uds-core-watcher'; do
    namespace=${namespace_selector%% *}; selector=${namespace_selector#* }
    pods=$(kubectl --context "$ctx" -n "$namespace" get pods -l "$selector" -o name)
    [ -z "$pods" ] || kubectl --context "$ctx" -n "$namespace" wait --for=condition=Ready pod -l "$selector" --timeout="$TIMEOUT"
  done
}

cleanup() {
  local ctx=$1 status=$2 kind namespace name _ _ _ marker failed=''
  trap - EXIT
  set +e
  discover "$ctx"
  while IFS=$'\t' read -r kind namespace name _ _ _ marker; do
    [ "$marker" = "$VALUE" ] && patch "$ctx" remove "$kind" "$namespace" "$name" || true
  done <<EOF
$(all_workloads)
EOF
  exit "$status"
}

case "${1-}" in
  suspend)
    [ -x "$ZARF" ] || { echo 'error: zarf not found beside helper' >&2; exit 1; }
    ctx=$(context)
    [ "$ctx" = k3d-uds ] || { echo "error: suspend requires k3d-uds, got ${ctx}" >&2; exit 1; }
    discover "$ctx"; require_bootstrap; validate_active_workloads "$ctx"; trap 'cleanup "$ctx" "$?"' EXIT
    suspend "$ctx"; "$SCRIPT_DIR/checkpoint.sh"; restore "$ctx"; trap - EXIT
    ;;
  restore)
    [ -x "$ZARF" ] || { echo 'error: zarf not found beside helper' >&2; exit 1; }
    ctx=$(context); wait_for_api "$ctx"; discover "$ctx"; require_bootstrap; restore "$ctx"
    ;;
  *) echo "error: expected 'suspend' or 'restore'" >&2; exit 2 ;;
esac
