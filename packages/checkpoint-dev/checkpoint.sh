#!/bin/bash
# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

set -euo pipefail

K3S_CONTAINER="k3d-uds-server-0"
IMAGE_NAME="ghcr.io/defenseunicorns/uds-core/checkpoint:latest"

# Verify the cluster is running before we start.
CONTAINER_ID=$(docker ps -qf "name=^${K3S_CONTAINER}$")
if [ -z "$CONTAINER_ID" ]; then
  echo "error: container '${K3S_CONTAINER}' not running" >&2
  exit 1
fi

# A checkpoint preserves the source node Docker IP, but Docker can assign the
# restored node a new IP. Kubelet preserves cloud provider addresses already in
# Node status, while the embedded K3s cloud controller can reuse the stale
# k3s.io/internal-ip annotation. Remove both persisted values and add the
# standard uninitialized taint so startup waits for the restored agent to
# publish its current IP before the cloud controller updates Node status.
echo "Clearing node status for ${K3S_CONTAINER} ..."
docker exec "$CONTAINER_ID" kubectl patch node "$K3S_CONTAINER" \
  --type=merge -p '{"metadata":{"annotations":{"k3s.io/internal-ip":null}}}' >/dev/null
docker exec "$CONTAINER_ID" kubectl taint node "$K3S_CONTAINER" \
  node.cloudprovider.kubernetes.io/uninitialized=true:NoSchedule --overwrite >/dev/null
docker exec "$CONTAINER_ID" kubectl patch node "$K3S_CONTAINER" \
  --subresource=status --type=merge \
  -p "{\"status\":{\"addresses\":[{\"address\":\"${K3S_CONTAINER}\",\"type\":\"Hostname\"}]}}" >/dev/null

# Pause once to get a consistent snapshot of image and volumes together.
echo "Pausing container ${K3S_CONTAINER} ..."
docker pause "$CONTAINER_ID"

trap 'docker unpause "$CONTAINER_ID" 2>/dev/null || true' EXIT

echo "Committing container ${K3S_CONTAINER} ..."
docker commit "$CONTAINER_ID" "$IMAGE_NAME" >/dev/null

echo "Streaming k3s volume ..."
docker cp "${K3S_CONTAINER}:/var/lib/rancher/k3s/." - > k3s_data.tar

echo "Streaming kubelet volume ..."
docker cp "${K3S_CONTAINER}:/var/lib/kubelet/." - > kubelet_data.tar

echo "Resuming container ${K3S_CONTAINER} ..."
docker unpause "$CONTAINER_ID"

echo "Saving checkpoint image ..."
docker save -o uds-k3d-checkpoint-latest.tar "$IMAGE_NAME"

echo "Saving busybox helper image ..."
docker pull cgr.dev/chainguard/busybox:latest
docker save cgr.dev/chainguard/busybox:latest -o busybox.tar

# Pack the three tarballs into a single bundle for Zarf to embed.
echo "Creating bundle ..."
tar --blocking-factor=64 -cf uds-checkpoint.tar \
  k3s_data.tar \
  kubelet_data.tar \
  uds-k3d-checkpoint-latest.tar

rm -f k3s_data.tar kubelet_data.tar uds-k3d-checkpoint-latest.tar

echo "Successfully checkpointed the cluster!"
