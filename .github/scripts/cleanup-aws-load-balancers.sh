#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

readonly REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-${UDS_REGION:-}}}"

if [[ -z "$REGION" ]]; then
  echo "AWS region is required through AWS_REGION, AWS_DEFAULT_REGION, or UDS_REGION" >&2
  exit 1
fi

command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

declare -a EKS_CLUSTERS=()
declare -a RKE2_CLUSTERS=()
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: cleanup-aws-load-balancers.sh [--dry-run] [--eks-cluster NAME] [--rke2-cluster NAME]

Deletes only load balancers owned by the supplied CI cluster names. Cluster
existence is checked before any deletion is attempted.
EOF
}

validate_cluster_name() {
  local cluster_name="$1"

  if [[ ! "$cluster_name" =~ ^[[:alnum:]][[:alnum:]._-]*$ ]]; then
    echo "Invalid cluster name: $cluster_name" >&2
    exit 1
  fi
}

while (($# > 0)); do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --eks-cluster)
      (($# >= 2)) || { echo "--eks-cluster requires a value" >&2; exit 1; }
      EKS_CLUSTERS+=("$2")
      shift 2
      ;;
    --rke2-cluster)
      (($# >= 2)) || { echo "--rke2-cluster requires a value" >&2; exit 1; }
      RKE2_CLUSTERS+=("$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "${RKE2_CLUSTER_NAMES:-}" ]]; then
  read -r -a captured_rke2_clusters <<< "$RKE2_CLUSTER_NAMES"
  RKE2_CLUSTERS+=("${captured_rke2_clusters[@]}")
fi

if ((${#EKS_CLUSTERS[@]} > 0)); then
  for cluster in "${EKS_CLUSTERS[@]}"; do
    [[ -n "$cluster" ]] && validate_cluster_name "$cluster"
  done
fi

if ((${#RKE2_CLUSTERS[@]} > 0)); then
  for cluster in "${RKE2_CLUSTERS[@]}"; do
    [[ -n "$cluster" ]] && validate_cluster_name "$cluster"
  done
fi

if ((${#EKS_CLUSTERS[@]} == 0 && ${#RKE2_CLUSTERS[@]} == 0)); then
  echo "No CI cluster names were captured; skipping AWS load balancer cleanup"
  exit 0
fi

assert_eks_cluster_gone() {
  local cluster_name="$1"
  local output

  if output=$(aws eks describe-cluster \
    --region "$REGION" \
    --name "$cluster_name" \
    --query 'cluster.status' \
    --output text 2>&1); then
    echo "Refusing to delete load balancers while EKS cluster exists: $cluster_name ($output)" >&2
    return 1
  fi

  if ! grep -q 'ResourceNotFoundException' <<< "$output"; then
    echo "Unable to verify that EKS cluster is gone: $cluster_name" >&2
    echo "$output" >&2
    return 1
  fi

  echo "Verified EKS cluster is gone: $cluster_name"
}

assert_rke2_cluster_gone() {
  local cluster_name="$1"
  local instances

  instances=$(aws ec2 describe-instances \
    --region "$REGION" \
    --filters \
      "Name=tag:cluster_name,Values=$cluster_name" \
      'Name=instance-state-name,Values=pending,running,stopping,stopped,shutting-down' \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text)

  if [[ -n "${instances//[[:space:]]/}" && "$instances" != "None" ]]; then
    echo "Refusing to delete load balancers while RKE2 cluster instances exist: $cluster_name ($instances)" >&2
    return 1
  fi

  echo "Verified RKE2 cluster instances are gone: $cluster_name"
}

if ((${#EKS_CLUSTERS[@]} > 0)); then
  for cluster in "${EKS_CLUSTERS[@]}"; do
    assert_eks_cluster_gone "$cluster"
  done
fi

if ((${#RKE2_CLUSTERS[@]} > 0)); then
  for cluster in "${RKE2_CLUSTERS[@]}"; do
    assert_rke2_cluster_gone "$cluster"
  done
fi

eks_tag_keys='[]'
if ((${#EKS_CLUSTERS[@]} > 0)); then
  for cluster in "${EKS_CLUSTERS[@]}"; do
    eks_tag_keys=$(jq --arg key "kubernetes.io/cluster/$cluster" '. + [$key]' <<< "$eks_tag_keys")
  done
fi

rke2_cluster_values='[]'
if ((${#RKE2_CLUSTERS[@]} > 0)); then
  for cluster in "${RKE2_CLUSTERS[@]}"; do
    rke2_cluster_values=$(jq --arg cluster "$cluster" '. + [$cluster]' <<< "$rke2_cluster_values")
  done
fi

matches_owned_cluster_tag() {
  local tags_json="$1"

  jq -e \
    --argjson eks_tag_keys "$eks_tag_keys" \
    --argjson rke2_cluster_values "$rke2_cluster_values" \
    '[.TagDescriptions[]?.Tags[]?
      | select(
          ((.Value == "owned") and ((.Key as $key | $eks_tag_keys | index($key)) != null)) or
          ((.Key == "elbv2.k8s.aws/cluster") and ((.Value as $cluster | $rke2_cluster_values | index($cluster)) != null))
        )
    ] | length > 0' <<< "$tags_json" >/dev/null
}

is_not_found_error() {
  grep -Eq 'LoadBalancerNotFound|ResourceNotFoundException' <<< "$1"
}

declare -a ELBV2_CANDIDATES=()
elbv2_arns=$(aws elbv2 describe-load-balancers \
  --region "$REGION" \
  --output json | jq -r '.LoadBalancers[]?.LoadBalancerArn')
while IFS= read -r arn; do
  [[ -z "$arn" ]] && continue
  if ! tags_json=$(aws elbv2 describe-tags \
    --region "$REGION" \
    --resource-arns "$arn" \
    --output json 2>&1); then
    if is_not_found_error "$tags_json"; then
      continue
    fi
    echo "Unable to inspect ELBv2 load balancer: $arn" >&2
    echo "$tags_json" >&2
    exit 1
  fi
  if matches_owned_cluster_tag "$tags_json"; then
    ELBV2_CANDIDATES+=("$arn")
  fi
done <<< "$elbv2_arns"

declare -a CLASSIC_CANDIDATES=()
classic_names=$(aws elb describe-load-balancers \
  --region "$REGION" \
  --output json | jq -r '.LoadBalancerDescriptions[]?.LoadBalancerName')
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  if ! tags_json=$(aws elb describe-tags \
    --region "$REGION" \
    --load-balancer-names "$name" \
    --output json 2>&1); then
    if is_not_found_error "$tags_json"; then
      continue
    fi
    echo "Unable to inspect classic load balancer: $name" >&2
    echo "$tags_json" >&2
    exit 1
  fi
  if matches_owned_cluster_tag "$tags_json"; then
    CLASSIC_CANDIDATES+=("$name")
  fi
done <<< "$classic_names"

echo "ELBv2 load balancers selected for deletion: ${#ELBV2_CANDIDATES[@]}"
if ((${#ELBV2_CANDIDATES[@]} > 0)); then
  printf '  %s\n' "${ELBV2_CANDIDATES[@]}"
fi
echo "Classic load balancers selected for deletion: ${#CLASSIC_CANDIDATES[@]}"
if ((${#CLASSIC_CANDIDATES[@]} > 0)); then
  printf '  %s\n' "${CLASSIC_CANDIDATES[@]}"
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run requested; no load balancers will be deleted"
  exit 0
fi

if ((${#ELBV2_CANDIDATES[@]} > 0)); then
  for arn in "${ELBV2_CANDIDATES[@]}"; do
    if output=$(aws elbv2 delete-load-balancer \
      --region "$REGION" \
      --load-balancer-arn "$arn" 2>&1); then
      echo "Requested ELBv2 deletion: $arn"
    elif is_not_found_error "$output"; then
      echo "ELBv2 load balancer already gone: $arn"
    else
      echo "Unable to delete ELBv2 load balancer: $arn" >&2
      echo "$output" >&2
      exit 1
    fi
  done

  batch=()
  for arn in "${ELBV2_CANDIDATES[@]}"; do
    batch+=("$arn")
    if ((${#batch[@]} == 20)); then
      aws elbv2 wait load-balancers-deleted \
        --region "$REGION" \
        --load-balancer-arns "${batch[@]}"
      batch=()
    fi
  done
  if ((${#batch[@]} > 0)); then
    aws elbv2 wait load-balancers-deleted \
      --region "$REGION" \
      --load-balancer-arns "${batch[@]}"
  fi
fi

if ((${#CLASSIC_CANDIDATES[@]} > 0)); then
  for name in "${CLASSIC_CANDIDATES[@]}"; do
    if output=$(aws elb delete-load-balancer \
      --region "$REGION" \
      --load-balancer-name "$name" 2>&1); then
      echo "Requested classic load balancer deletion: $name"
    elif is_not_found_error "$output"; then
      echo "Classic load balancer already gone: $name"
    else
      echo "Unable to delete classic load balancer: $name" >&2
      echo "$output" >&2
      exit 1
    fi
  done

  for name in "${CLASSIC_CANDIDATES[@]}"; do
    for attempt in $(seq 1 60); do
      if output=$(aws elb describe-load-balancers \
        --region "$REGION" \
        --load-balancer-names "$name" \
        --output json 2>&1); then
        if [[ "$attempt" == 60 ]]; then
          echo "Timed out waiting for classic load balancer deletion: $name" >&2
          exit 1
        fi
        sleep 5
        continue
      fi

    if is_not_found_error "$output"; then
        break
      fi

      echo "Unable to verify classic load balancer deletion: $name" >&2
      echo "$output" >&2
      exit 1
    done
  done
fi

echo "AWS load balancer cleanup complete"
