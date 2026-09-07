#!/bin/bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

readonly MARKER='checkpoint.uds.dev/suspended'
readonly VALUE='true'
readonly TIMEOUT='180s'
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
if [ -x "$(pwd)/zarf" ]; then
  readonly ZARF="$(pwd)/zarf"
elif [ -x "${SCRIPT_DIR}/zarf" ]; then
  readonly ZARF="${SCRIPT_DIR}/zarf"
else
  readonly ZARF="$(command -v zarf || true)"
fi

kubectl() {
  "$ZARF" tools kubectl "$@"
}

yq() {
  "$ZARF" tools yq "$@"
}

context() {
  local current
  current=$(kubectl config current-context)
  case "$current" in
    k3d-*) echo "$current" ;;
    *)
      echo "error: current context is not K3d: ${current}" >&2
      return 1
      ;;
  esac
}

phase_for() {
  case "$1:$2" in
    kube-system:*|zarf:*|istio-system:*) echo infrastructure ;;
    pepr-system:admission|pepr-system:watcher) echo "$2" ;;
    *) echo application ;;
  esac
}

wait_for_api() {
  local ctx=$1 attempt
  for attempt in $(seq 1 30); do
    if kubectl --context "$ctx" version --request-timeout=5s >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  echo "error: API did not become available for ${ctx}" >&2
  return 1
}

# Workload rows: kind, namespace, name, replicas, generation, phase, marker.
workloads=''

discover() {
  local ctx=$1 inventory namespace name replicas generation role marker kind phase row
  inventory=$(kubectl --context "$ctx" get deployments,statefulsets,daemonsets,replicasets -A -o json)
  workloads=''
  while IFS=$'\t' read -r kind namespace name replicas generation role marker; do
    if [ -z "$namespace" ]; then
      continue
    fi
    if [ "$role" = __none__ ]; then
      role=''
    fi
    if [ "$marker" = __none__ ]; then
      marker=''
    fi
    phase=$(phase_for "$namespace" "$role")
    row=$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s' "$kind" "$namespace" "$name" "$replicas" "$generation" "$phase" "$marker")
    workloads="${workloads}${workloads:+$'\n'}${row}"
  done <<EOF
$(printf '%s' "$inventory" | yq -r '.items[] | select(.kind != "ReplicaSet" or ((.metadata.ownerReferences[]? | select(.controller == true and .kind == "Deployment")) != null)) | [(.kind | downcase), .metadata.namespace, .metadata.name, (.spec.replicas // 1), (.metadata.generation // 0), (.spec.template.metadata.labels."pepr.dev/controller" // "__none__"), (.spec.template.spec.nodeSelector."checkpoint.uds.dev/suspended" // "__none__")] | @tsv')
EOF
}

is_managed() {
  local kind=$1 namespace=$2 name=$3
  printf '%s\n' "$workloads" | awk -F '\t' -v kind="$kind" -v namespace="$namespace" -v name="$name" '$1 == kind && $2 == namespace && $3 == name { found = 1 } END { exit !found }'
}

require_bootstrap() {
  local required role
  for required in 'deployment istio-system istiod' 'daemonset istio-system istio-cni-node' 'daemonset istio-system ztunnel'; do
    if ! printf '%s\n' "$workloads" | awk -F '\t' -v kind="${required%% *}" -v namespace="$(printf '%s' "$required" | cut -d' ' -f2)" -v name="${required##* }" '$1 == kind && $2 == namespace && $3 == name { found = 1 } END { exit !found }'; then
      echo "error: required infrastructure workload missing: ${required}" >&2; return 1;
    fi
  done
  for role in admission watcher; do
    if ! printf '%s\n' "$workloads" | awk -F '\t' -v role="$role" '$2 == "pepr-system" && $6 == role { found = 1 } END { exit !found }'; then
      echo "error: required Pepr ${role} workload missing" >&2; return 1;
    fi
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
    [.metadata.namespace, .metadata.name, ((.metadata.ownerReferences[]? | select(.controller == true) | .kind) // "__none__"), ((.metadata.ownerReferences[]? | select(.controller == true) | .name) // "__none__"), (.metadata.annotations."kubernetes.io/config.mirror" // "__none__"), (.spec.nodeName // "__none__")] | @tsv'
}

validate_active_workloads() {
  local ctx=$1 jobs pods namespace name owner_kind owner_name mirror node_name kind
  jobs=$(kubectl --context "$ctx" get jobs -A -o json | yq -r '.items[] | [.metadata.namespace, .metadata.name, (.status.active // 0)] | @tsv' | awk -F '\t' 'NF == 3 && $1 != "" && $2 != "" && $3 > 0 { print $1 "/" $2 }')
  if [ -n "$jobs" ]; then
    echo "error: active unsupported Jobs: ${jobs}" >&2
    return 1
  fi
  pods=$(active_pods "$ctx")
  while IFS=$'\t' read -r namespace name owner_kind owner_name mirror node_name; do
    if [ -z "$namespace" ] || [ "$mirror" != __none__ ]; then
      continue
    fi
    kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
    if ! is_managed "$kind" "$namespace" "$owner_name"; then
      echo "error: active unsupported pod: ${namespace}/${name}" >&2
      return 1
    fi
  done <<EOF
$pods
EOF
}

mark_workloads() {
  local ctx=$1 kind namespace name _ _ _ marker
  while IFS=$'\t' read -r kind namespace name _ _ _ marker; do
    if [ -z "$kind" ] || [ "$marker" = "$VALUE" ]; then
      continue
    fi
    if [ -n "$marker" ]; then
      echo "error: unexpected ${MARKER} on ${kind}/${namespace}/${name}" >&2
      return 1
    fi
    patch "$ctx" add "$kind" "$namespace" "$name"
  done <<EOF
$workloads
EOF
}

delete_managed_pods() {
  local ctx=$1 pods namespace name owner_kind owner_name mirror node_name kind
  pods=$(active_pods "$ctx")
  while IFS=$'\t' read -r namespace name owner_kind owner_name mirror node_name; do
    if [ -z "$namespace" ] || [ "$mirror" != __none__ ]; then
      continue
    fi
    kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
    if [ "$node_name" != __none__ ] && is_managed "$kind" "$namespace" "$owner_name"; then
      kubectl --context "$ctx" -n "$namespace" delete pod "$name" --wait=false >/dev/null
    fi
  done <<EOF
$pods
EOF
}

suspend() {
  local ctx=$1 attempt pods namespace name owner_kind owner_name mirror node_name kind found
  for attempt in $(seq 1 30); do
    discover "$ctx"
    mark_workloads "$ctx"
    discover "$ctx"
    validate_active_workloads "$ctx"
    delete_managed_pods "$ctx"
    found=0
    pods=$(active_pods "$ctx")
    while IFS=$'\t' read -r namespace name owner_kind owner_name mirror node_name; do
    if [ -z "$namespace" ] || [ "$mirror" != __none__ ]; then
      continue
    fi
      kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
      if [ "$node_name" != __none__ ] && is_managed "$kind" "$namespace" "$owner_name"; then
        found=1
      fi
    done <<EOF
$pods
EOF
    if [ "$found" = 0 ]; then
      return
    fi
    sleep 2
  done
  echo 'error: suspended Pods did not disappear' >&2
  return 1
}

wait_for_rollout() {
  local ctx=$1 kind=$2 namespace=$3 name=$4 replicas=$5 generation=$6 desired
  [ "$kind" = replicaset ] && return
  kubectl --context "$ctx" -n "$namespace" wait "$kind/$name" --for="jsonpath={.status.observedGeneration}=${generation}" --timeout="$TIMEOUT"
  if [ "$kind" = daemonset ]; then
    desired=$(kubectl --context "$ctx" -n "$namespace" get daemonset "$name" -o json | yq -r '.status.desiredNumberScheduled // 0')
  else
    desired=$replicas
  fi
  [ "$desired" = 0 ] && return
  kubectl --context "$ctx" -n "$namespace" rollout status "$kind/$name" --timeout="$TIMEOUT"
}

delete_marked_pods() {
  local ctx=$1 pods namespace name owner_kind owner_name kind
  pods=$(kubectl --context "$ctx" get pods -A -o json | yq -r '
    .items[] | select(.spec.nodeSelector."checkpoint.uds.dev/suspended" == "true") |
    [.metadata.namespace, .metadata.name, ((.metadata.ownerReferences[]? | select(.controller == true) | .kind) // "__none__"), ((.metadata.ownerReferences[]? | select(.controller == true) | .name) // "__none__")] | @tsv')
  while IFS=$'\t' read -r namespace name owner_kind owner_name; do
    [ -z "$namespace" ] && continue
    kind=$(printf '%s' "$owner_kind" | tr '[:upper:]' '[:lower:]')
    if is_managed "$kind" "$namespace" "$owner_name"; then
      kubectl --context "$ctx" -n "$namespace" delete pod "$name" --wait=false >/dev/null
    fi
  done <<EOF
$pods
EOF
}

release() {
  local ctx=$1 phase=$2 kind namespace name replicas generation current marker
  discover "$ctx"
  while IFS=$'\t' read -r kind namespace name replicas generation current marker; do
    if [ "$current" != "$phase" ] || [ -z "$marker" ]; then
      continue
    fi
    if [ "$marker" != "$VALUE" ]; then
      echo "error: unexpected ${MARKER} on ${kind}/${namespace}/${name}" >&2
      return 1
    fi
    patch "$ctx" remove "$kind" "$namespace" "$name"
  done <<EOF
$workloads
EOF
  delete_marked_pods "$ctx"
  discover "$ctx"
  while IFS=$'\t' read -r kind namespace name replicas generation current marker; do
    if [ "$current" != "$phase" ]; then
      continue
    fi
    if [ -n "$marker" ]; then
      echo "error: ${kind}/${namespace}/${name} remained suspended" >&2
      return 1
    fi
    wait_for_rollout "$ctx" "$kind" "$namespace" "$name" "$replicas" "$generation"
  done <<EOF
$workloads
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
    if [ -n "$pods" ]; then
      kubectl --context "$ctx" -n "$namespace" wait --for=condition=Ready pod -l "$selector" --timeout="$TIMEOUT"
    fi
  done
}

cleanup() {
  local ctx=$1 status=$2 kind namespace name _ _ _ marker
  trap - EXIT
  set +e
  discover "$ctx"
  while IFS=$'\t' read -r kind namespace name _ _ _ marker; do
    if [ "$marker" = "$VALUE" ]; then
      patch "$ctx" remove "$kind" "$namespace" "$name" || true
    fi
  done <<EOF
$workloads
EOF
  delete_marked_pods "$ctx"
  exit "$status"
}

main() {
  local command=${1-} ctx

  case "$command" in
    suspend)
      if [ ! -x "$ZARF" ]; then
        echo 'error: zarf executable not found' >&2
        return 1
      fi
      ctx=$(context)
      if [ "$ctx" != k3d-uds ]; then
        echo "error: suspend requires k3d-uds, got ${ctx}" >&2
        return 1
      fi
      discover "$ctx"
      require_bootstrap
      validate_active_workloads "$ctx"
      trap 'cleanup "$ctx" "$?"' EXIT
      suspend "$ctx"
      "$SCRIPT_DIR/checkpoint.sh"
      restore "$ctx"
      trap - EXIT
      ;;
    restore)
      if [ ! -x "$ZARF" ]; then
        echo 'error: zarf executable not found' >&2
        return 1
      fi
      ctx=$(context)
      wait_for_api "$ctx"
      discover "$ctx"
      require_bootstrap
      restore "$ctx"
      ;;
    *)
      echo "error: expected 'suspend' or 'restore'" >&2
      return 2
      ;;
  esac
}

main "$@"
