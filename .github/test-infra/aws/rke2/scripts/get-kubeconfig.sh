#!/bin/bash
# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Utility script that can be called from a uds task after tofu has deployed the e2e test module
#
set -euo pipefail
echo "tofu version: $(tofu --version)"

# Get required outputs from tofu
tofu output -raw private_key >key.pem
chmod 600 key.pem
trap 'rm -f key.pem' EXIT

bootstrap_ip=$(tofu output -raw bootstrap_ip)
node_user=$(tofu output -raw node_user)
cluster_hostname=$(tofu output -raw cluster_hostname)

ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i key.pem)

# Try ssh up to 20 times waiting 15 seconds between tries
ok=false
for i in $(seq 1 20); do
  echo "Waiting on cloud-init to finish running on cluster node (attempt $i/20)"
  if ssh "${ssh_opts[@]}" "${node_user}@${bootstrap_ip}" "cloud-init status --wait" >/dev/null; then
    ok=true
    break
  fi
  sleep 15
done

if [[ "$ok" != true ]]; then
  echo "ERROR: cloud-init did not finish after 20 attempts" >&2
  exit 1
fi

# Make sure .kube directory exists
mkdir -p ~/.kube

# Copy kubeconfig from cluster node
ssh "${ssh_opts[@]}" "${node_user}@${bootstrap_ip}" \
  "mkdir -p /home/${node_user}/.kube && sudo cp /etc/rancher/rke2/rke2.yaml /home/${node_user}/.kube/config && sudo chown ${node_user} /home/${node_user}/.kube/config" >/dev/null
scp "${ssh_opts[@]}" "${node_user}@${bootstrap_ip}:/home/${node_user}/.kube/config" ./rke2-config >/dev/null

# Replace the loopback address with the bootstrap IP address
# GNU sed supports --version flag, BSD/macOS sed does not
# On macOS (BSD sed), -i requires a backup-extension argument (often '')
if sed --version >/dev/null 2>&1; then
  sed -i "s/127.0.0.1/${bootstrap_ip}/g" ./rke2-config >/dev/null
else
  sed -i '' "s/127.0.0.1/${bootstrap_ip}/g" ./rke2-config >/dev/null
fi

mkdir -p ~/.kube
mv ./rke2-config ~/.kube/config
#export KUBECONFIG=$(pwd)/rke2-config

# Add or update /etc/hosts file record
matches_in_hosts="$(grep -nF -- "$cluster_hostname" /etc/hosts | cut -f1 -d: || true)"
host_entry="${bootstrap_ip} ${cluster_hostname}"

if [[ -n "$matches_in_hosts" ]]; then
  echo "Updating existing hosts entry."
  while read -r line_number; do
    [[ -z "$line_number" ]] && continue
    if sed --version >/dev/null 2>&1; then
      sudo sed -i "${line_number}s|.*|${host_entry}|" /etc/hosts >/dev/null
    else
      sudo sed -i '' "${line_number}s|.*|${host_entry}|" /etc/hosts >/dev/null
    fi
  done <<<"$matches_in_hosts"
else
  echo "Adding new hosts entry."
  echo "$host_entry" | sudo tee -a /etc/hosts >/dev/null
fi
