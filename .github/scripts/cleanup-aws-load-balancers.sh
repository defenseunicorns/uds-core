#!/usr/bin/env bash
# Copyright 2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

readonly REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-${UDS_REGION:-}}}"

usage() {
  echo "Usage: cleanup-aws-load-balancers.sh [--dry-run] <eks|rke2> <cluster-name>" >&2
}

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

if (($# != 2)); then
  usage
  exit 2
fi

readonly CLUSTER_TYPE="$1"
readonly CLUSTER_NAME="$2"

case "$CLUSTER_TYPE" in
  eks|rke2) ;;
  *)
    usage
    exit 2
    ;;
esac

if [[ -z "$CLUSTER_NAME" ]]; then
  echo "Cluster name is required" >&2
  exit 2
fi

if [[ ! "$CLUSTER_NAME" =~ ^[[:alnum:]][[:alnum:]._-]*$ ]]; then
  echo "Invalid cluster name: $CLUSTER_NAME" >&2
  exit 2
fi

if [[ -z "$REGION" ]]; then
  echo "AWS region is required through AWS_REGION, AWS_DEFAULT_REGION, or UDS_REGION" >&2
  exit 1
fi

command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

case "$CLUSTER_TYPE" in
  eks)
    if output=$(aws eks describe-cluster \
      --region "$REGION" \
      --name "$CLUSTER_NAME" \
      --query 'cluster.status' \
      --output text 2>&1); then
      echo "Refusing to delete load balancers while EKS cluster exists: $CLUSTER_NAME ($output)" >&2
      exit 1
    elif [[ "$output" == *ResourceNotFoundException* ]]; then
      echo "Verified EKS cluster is gone: $CLUSTER_NAME"
    else
      echo "Unable to verify that EKS cluster is gone: $CLUSTER_NAME" >&2
      echo "$output" >&2
      exit 1
    fi
    readonly TAG_KEY="kubernetes.io/cluster/$CLUSTER_NAME"
    readonly TAG_VALUE="owned"
    ;;
  rke2)
    if ! instances=$(aws ec2 describe-instances \
      --region "$REGION" \
      --filters \
        "Name=tag:cluster_name,Values=$CLUSTER_NAME" \
        'Name=instance-state-name,Values=pending,running,stopping,stopped,shutting-down' \
      --query 'Reservations[].Instances[].InstanceId' \
      --output text 2>&1); then
      echo "Unable to verify that RKE2 cluster instances are gone: $CLUSTER_NAME" >&2
      echo "$instances" >&2
      exit 1
    fi
    if [[ -n "${instances//[[:space:]]/}" && "$instances" != "None" ]]; then
      echo "Refusing to delete load balancers while RKE2 cluster instances exist: $CLUSTER_NAME ($instances)" >&2
      exit 1
    fi
    echo "Verified RKE2 cluster instances are gone: $CLUSTER_NAME"
    readonly TAG_KEY="elbv2.k8s.aws/cluster"
    readonly TAG_VALUE="$CLUSTER_NAME"
    ;;
esac

if ! load_balancer_arns=$(aws resourcegroupstaggingapi get-resources \
  --region "$REGION" \
  --resource-type-filters elasticloadbalancing:loadbalancer \
  --tag-filters "Key=$TAG_KEY,Values=$TAG_VALUE" \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output json \
  --no-cli-pager | jq -r '.[]?'); then
  echo "Unable to find load balancers tagged for cluster $CLUSTER_NAME" >&2
  exit 1
fi

declare -a ELBV2_ARNS=()
declare -a CLASSIC_NAMES=()
while IFS= read -r arn; do
  [[ -z "$arn" ]] && continue
  if [[ "$arn" =~ :loadbalancer/(app|net|gwy)/ ]]; then
    ELBV2_ARNS+=("$arn")
  elif [[ "$arn" =~ :loadbalancer/([^/]+)$ ]]; then
    CLASSIC_NAMES+=("${BASH_REMATCH[1]}")
  else
    echo "Unexpected load balancer ARN from Resource Groups Tagging API: $arn" >&2
    exit 1
  fi
done <<< "$load_balancer_arns"

echo "Found ${#ELBV2_ARNS[@]} ELBv2 and ${#CLASSIC_NAMES[@]} Classic load balancers for $CLUSTER_NAME"
if [[ "$DRY_RUN" == true ]]; then
  ((${#ELBV2_ARNS[@]} == 0)) || printf '  %s\n' "${ELBV2_ARNS[@]}"
  ((${#CLASSIC_NAMES[@]} == 0)) || printf '  %s\n' "${CLASSIC_NAMES[@]}"
  echo "Dry run requested; no load balancers were deleted"
  exit 0
fi

for arn in "${ELBV2_ARNS[@]}"; do
  echo "Requesting ELBv2 deletion: $arn"
  if ! output=$(aws elbv2 delete-load-balancer \
    --region "$REGION" \
    --load-balancer-arn "$arn" 2>&1); then
    if [[ "$output" == *LoadBalancerNotFound* || "$output" == *ResourceNotFoundException* ]]; then
      echo "ELBv2 load balancer already gone: $arn"
    else
      echo "Unable to delete ELBv2 load balancer: $arn" >&2
      echo "$output" >&2
      exit 1
    fi
  fi
done

for ((index = 0; index < ${#ELBV2_ARNS[@]}; index += 20)); do
  aws elbv2 wait load-balancers-deleted \
    --region "$REGION" \
    --load-balancer-arns "${ELBV2_ARNS[@]:index:20}"
done

for name in "${CLASSIC_NAMES[@]}"; do
  echo "Requesting Classic load balancer deletion: $name"
  if ! output=$(aws elb delete-load-balancer \
    --region "$REGION" \
    --load-balancer-name "$name" 2>&1); then
    if [[ "$output" == *LoadBalancerNotFound* || "$output" == *ResourceNotFoundException* ]]; then
      echo "Classic load balancer already gone: $name"
    else
      echo "Unable to delete Classic load balancer: $name" >&2
      echo "$output" >&2
      exit 1
    fi
  fi
done

for name in "${CLASSIC_NAMES[@]}"; do
  deleted=false
  for _ in {1..60}; do
    if output=$(aws elb describe-load-balancers \
      --region "$REGION" \
      --load-balancer-names "$name" 2>&1); then
      sleep 5
    elif [[ "$output" == *LoadBalancerNotFound* || "$output" == *ResourceNotFoundException* ]]; then
      deleted=true
      break
    else
      echo "Unable to verify Classic load balancer deletion: $name" >&2
      echo "$output" >&2
      exit 1
    fi
  done
  if [[ "$deleted" != true ]]; then
    echo "Timed out waiting for Classic load balancer deletion: $name" >&2
    exit 1
  fi
done

echo "AWS load balancer cleanup complete"
