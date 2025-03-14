# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
set -eo pipefail
# List of zarf packages needed to setup test
ADMIN_IP=""
TENANT_IP=""
PASSTHROUGH_IP=""
AMBIENT=false
# Function to display help message
help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --admin-ip         IP to use for the admin gateway"
  echo "  --tenant-ip        IP to use for the tenant gateway"
  echo "  --passthrough-ip   IP to use for the passthrough gateway"
  echo "  --ambient          Deploy istio in Ambient mode"
  echo "  --help             Display this help message"
  exit 0
}

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-ip)
      ADMIN_IP="$2"
      shift 2
      ;;
    --tenant-ip)
      TENANT_IP="$2"
      shift 2
      ;;
    --passthrough-ip)
      PASSTHROUGH_IP="$2"
      shift 2
      ;;
    --ambient)
      AMBIENT=true
      shift
      ;;
    --help)
      help
      ;;
    *)
      echo "Unknown parameter: $1"
      help
      ;;
  esac
done
if [[ -z "$ADMIN_IP" ]] || [[ -z "$TENANT_IP" ]] || [[ -z "$PASSTHROUGH_IP" ]]; then
  echo "Error: --admin-ip, --tenant-ip, and --passthrough-ip are required."
  exit 1
fi
# Validate that the metallb package is present before proceeding
if [ ! -f zarf-package-metallb-amd64-0.14.9-uds.0.tar.zst ]; then
  echo "Error: metallb package not found. This package requires authentication to pull"
  echo "Login to the package registry and pull using the following command:"
  echo "zarf package pull oci://ghcr.io/uds-packages/uds/metallb:0.14.9-uds.0-upstream"
  exit 1
fi
# Validate the UDS Core packages are present before proceeding
for package in core-base core-identity-authorization; do
  if [ ! -f zarf-package-$package-amd64-0.37.0.tar.zst ]; then
    echo "Error: $package package not found."
    zarf package pull oci://ghcr.io/defenseunicorns/packages/uds/$package:0.37.0-upstream
  fi
done
# Validate the nginx package is present before proceeding
if [ ! -f zarf-package-nginx-amd64-1.27.4-uds.0.tar.zst ]; then
  zarf package pull oci://ghcr.io/defenseunicorns/packages/uds/nginx:1.27.4-uds.0-upstream
fi
#Deploy k3s from zarf and metallb
zarf init --set K3S_ARGS="--disable traefik --disable servicelb" --components=k3s --confirm
zarf package deploy zarf-package-metallb-amd64-0.14.9-uds.0.tar.zst --set IP_ADDRESS_ADMIN_INGRESSGATEWAY="$ADMIN_IP" --set IP_ADDRESS_TENANT_INGRESSGATEWAY="$TENANT_IP" --set IP_ADDRESS_PASSTHROUGH_INGRESSGATEWAY="$PASSTHROUGH_IP" --confirm

# Deploy UDS Core Base and UDS Core Identity and Authorization
if [[ "$AMBIENT" == "true" ]]; then
  zarf package deploy zarf-package-core-base-amd64-0.37.0.tar.zst --components=istio-ambient --confirm
else
  zarf package deploy zarf-package-core-base-amd64-0.37.0.tar.zst --confirm
fi
zarf package deploy zarf-package-core-identity-authorization-amd64-0.37.0.tar.zst --confirm

# Deploy nginx without SSO
zarf p deploy zarf-package-nginx-amd64-1.27.4-uds.0.tar.zst --confirm
kubectl patch package nginx -n nginx --type=json -p='[{"op": "remove", "path": "/spec/sso"}]'

# Remove the UDS Core Identity and Authorization package
zarf package remove core-identity-authorization --confirm

# Switch nginx to ambient and open up netpols
kubectl patch package nginx -n nginx --type='json' -p='[
  {"op": "replace", "path": "/spec/network/allow/0/remoteGenerated", "value": "Anywhere"},
  {"op": "replace", "path": "/spec/network/allow/1/remoteGenerated", "value": "Anywhere"}
]'
sleep 2
kubectl wait --for=jsonpath='{.status.phase}'=Ready package -n nginx nginx
if [[ "$AMBIENT" == "true" ]]; then
  kubectl label namespace nginx istio.io/dataplane-mode=ambient --overwrite
  kubectl label namespace nginx istio-injection- --overwrite
  kubectl delete po -n nginx --all
fi
