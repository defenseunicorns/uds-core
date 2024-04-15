# core-slim-dev (0.18.0)
UDS Core (Istio, UDS Operator and Keycloak)

## Variables

The following table lists the variables included in this package, along with their descriptions and default values if
applicable.

| Name | Description | Default Value |
| ---- | ----------- | ------------- |
| `DOMAIN` | Cluster domain | `uds.dev` |


## Components
| Component Name | Charts | Images |
| -------------- | ------ | ------ |
| istio-controlplane | base@1.20.3</br>istiod@1.20.3</br> | `docker.io/istio/pilot:1.20.3-distroless`</br>`docker.io/istio/proxyv2:1.20.3-distroless`</br> |
| istio-admin-gateway | gateway@1.20.3</br>uds-istio-config@0.2.0</br> |  |
| istio-tenant-gateway | gateway@1.20.3</br>uds-istio-config@0.2.0</br> |  |
| istio-passthrough-gateway | gateway@1.20.3</br>uds-istio-config@0.2.0</br> |  |
| pepr-uds-core |  | `ghcr.io/defenseunicorns/pepr/controller:v0.28.7`</br> |
| keycloak | keycloak@23.0.4</br> | `quay.io/keycloak/keycloak:23.0.4`</br>`ghcr.io/defenseunicorns/uds/identity-config:0.3.6`</br> |
