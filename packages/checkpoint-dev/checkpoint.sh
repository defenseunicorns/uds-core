#!/bin/bash

# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Name of the running k3d container
K3S_CONTAINER="k3d-uds-server-0"

if [ -z "$TMPDIR" ]; then
    #  macOS sets TMPDIR to a user temp directory - this also provides more options to linux
    TMPDIR="/tmp"
fi
DATA_DIR="${TMPDIR}/uds-checkpoint-data"

# Step 0: Ensure we can get sudo
echo "This package requires elevated permissions to create - requesting sudo (if paused enter password)"
sudo echo "got sudo! success!"

# Step 1: Get the container ID of the running k3d container
CONTAINER_ID=$(docker ps -qf "name=$K3S_CONTAINER")

if [ -z "$CONTAINER_ID" ]; then
    echo "No running container found for $K3S_CONTAINER"
    exit 1
fi

# Flush iptables/nftables ruleset
docker exec -i $CONTAINER_ID nft flush ruleset

# Step 2: Get the mounted volumes of the running container
echo "Inspecting container volumes for $CONTAINER_ID..."
VOLUMES=$(docker inspect -f '{{ json .Mounts }}' "$CONTAINER_ID" | jq)

# Step 3: Prepare directories to save the volume data
sudo rm -rf "$DATA_DIR"
mkdir -p "${DATA_DIR}/kubelet_data" "${DATA_DIR}/k3s_data"

# Step 4: Loop through volumes and copy data to corresponding directories
echo "Copying volumes to local directories..."

for row in $(echo "$VOLUMES" | jq -r '.[] | @base64'); do
    _jq() {
        echo "${row}" | base64 --decode | jq -r "${1}"
    }

    SOURCE=$(_jq '.Source')
    DESTINATION=$(_jq '.Destination')

    case "$DESTINATION" in
        "/var/lib/kubelet")
            echo "Copying $SOURCE to ${DATA_DIR}/kubelet_data/"
            sudo cp -a "$SOURCE"/. "${DATA_DIR}/kubelet_data/"
            ;;
        "/var/lib/rancher/k3s")
            echo "Copying $SOURCE to ${DATA_DIR}/k3s_data/"
            sudo cp -a "$SOURCE"/. "${DATA_DIR}/k3s_data/"
            ;;
        *)
            echo "$DESTINATION is not needed. Skipping..."
            ;;
    esac
done

# Step 5: Commit and save the current container as a new image
IMAGE_NAME="ghcr.io/defenseunicorns/uds-core/checkpoint:latest"
echo "Committing container $CONTAINER_ID to image $IMAGE_NAME:latest..."
docker commit -p "$CONTAINER_ID" "$IMAGE_NAME"

echo "Saving image to ${DATA_DIR}/uds-k3d-checkpoint-latest.tar..."
sudo docker save -o "${DATA_DIR}/uds-k3d-checkpoint-latest.tar" "$IMAGE_NAME"

echo "Container image saved to ${DATA_DIR}/uds-k3d-checkpoint-latest.tar"

# Step 6: Create a tarball from the data contents
echo "Creating a final tarball to include in the package"
sudo tar --blocking-factor=64 -cpf uds-checkpoint.tar -C "$DATA_DIR" .

echo "Successfully checkpointed the cluster!"

exit 0
