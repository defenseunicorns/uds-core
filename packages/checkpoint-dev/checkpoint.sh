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
docker pull busybox
docker save busybox -o busybox.tar

# Pack the three tarballs into a single bundle for Zarf to embed.
echo "Creating bundle ..."
tar --blocking-factor=64 -cf uds-checkpoint.tar \
  k3s_data.tar \
  kubelet_data.tar \
  uds-k3d-checkpoint-latest.tar

rm -f k3s_data.tar kubelet_data.tar uds-k3d-checkpoint-latest.tar

echo "Successfully checkpointed the cluster!"
