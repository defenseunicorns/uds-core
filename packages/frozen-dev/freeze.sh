#!/bin/bash

# Name of the running k3d container
K3S_CONTAINER="k3d-uds-server-0"

# Step 0: Ensure we can get sudo
echo "This package requires elevated permissions to create - requesting sudo (if paused enter password)"
sudo echo "got sudo! success!"

# Step 1: Get the container ID of the running k3d container
CONTAINER_ID=$(docker ps -qf "name=$K3S_CONTAINER")

if [ -z "$CONTAINER_ID" ]; then
    echo "No running container found for $K3S_CONTAINER"
    exit 1
fi

# Step 2: Get the mounted volumes of the running container
echo "Inspecting container volumes for $CONTAINER_ID..."
VOLUMES=$(docker inspect -f '{{ json .Mounts }}' "$CONTAINER_ID" | jq)

# Step 3: Prepare directories to save the volume data
sudo rm -rf data
mkdir -p data/kubelet_data data/k3s_data

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
            echo "Copying $SOURCE to data/kubelet_data/"
            sudo cp -a "$SOURCE"/. data/kubelet_data/
            ;;
        "/var/lib/rancher/k3s")
            echo "Copying $SOURCE to data/k3s_data/"
            sudo cp -a "$SOURCE"/. data/k3s_data/
            ;;
        *)
            echo "$DESTINATION is not needed. Skipping..."
            ;;
    esac
done

# Step 5: Commit and save the current container as a new image
IMAGE_NAME="ghcr.io/defenseunicorns/uds-core/frozen:latest"
echo "Committing container $CONTAINER_ID to image $IMAGE_NAME:latest..."
docker commit -p "$CONTAINER_ID" "$IMAGE_NAME"

echo "Saving image to data/uds-k3d-frozen-latest.tar..."
docker save -o data/uds-k3d-frozen-latest.tar "$IMAGE_NAME"

echo "Container image saved to data/uds-k3d-frozen-latest.tar"

# Step 6: Create a tarball from the data contents
echo "Creating a final tarball to include in the package"
sudo tar --blocking-factor=64 -cpf uds-frozen.tar data
sudo chown -R $(whoami):$(whoami) "$(pwd)/uds-frozen.tar"

echo "Successfully froze the cluster!"

exit 0
