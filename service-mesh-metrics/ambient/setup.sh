# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Deploy modified slim-dev + metrics-server
pushd ../../
yq eval '(.packages[] | select(.name == "core-base")).optionalComponents = ["istio-ambient"]' -i bundles/k3d-slim-dev/uds-bundle.yaml
uds run -f tasks.yaml slim-dev --set FLAVOR=unicorn
git restore bundles/k3d-slim-dev/uds-bundle.yaml
uds run -f tasks.yaml test:single-layer --set LAYER=metrics-server --set FLAVOR=unicorn
popd

# Deploy nginx without SSO
zarf p deploy oci://ghcr.io/defenseunicorns/packages/private/uds/nginx:1.27.4-uds.0-unicorn --confirm
kubectl patch package nginx -n nginx --type=json -p='[{"op": "remove", "path": "/spec/sso"}]'

# Clean up some extra stuff we don't need (deployed initially so that nginx won't fail)
kubectl delete ns keycloak
kubectl delete ns authservice

# Switch nginx to ambient and open up netpols
kubectl patch package nginx -n nginx --type='json' -p='[
  {"op": "replace", "path": "/spec/network/allow/0/remoteGenerated", "value": "Anywhere"},
  {"op": "replace", "path": "/spec/network/allow/1/remoteGenerated", "value": "Anywhere"}
]'
sleep 2
kubectl wait --for=jsonpath='{.status.phase}'=Ready package -n nginx nginx
kubectl label namespace nginx istio.io/dataplane-mode=ambient --overwrite
kubectl label namespace nginx istio-injection- --overwrite
kubectl delete po -n nginx --all
