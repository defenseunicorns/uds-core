# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Deploy slim-dev + metrics-server
pushd ../../
uds run -f tasks.yaml slim-dev --set FLAVOR=unicorn
uds run -f tasks.yaml test:single-layer --set LAYER=metrics-server --set FLAVOR=unicorn
popd

# Deploy nginx without SSO
zarf p deploy oci://ghcr.io/defenseunicorns/packages/private/uds/nginx:1.27.4-uds.0-unicorn --confirm
kubectl patch package nginx -n nginx --type=json -p='[{"op": "remove", "path": "/spec/sso"}]'

# Reduce sidecar resource requests
kubectl patch deployment nginx -n nginx --type='merge' -p='{
  "spec": {
    "template": {
      "metadata": {
        "annotations": {
          "sidecar.istio.io/proxyCPU": "10m",
          "sidecar.istio.io/proxyMemory": "30Mi"
        }
      }
    }
  }
}'

# Clean up some extra stuff we don't need (deployed initially so that nginx won't fail)
kubectl delete ns keycloak
kubectl delete ns authservice
