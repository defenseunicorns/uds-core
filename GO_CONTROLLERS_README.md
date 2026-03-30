# Go Controllers

Go-based Kubernetes controllers running alongside Pepr in UDS Core.

## Location

Source code: `src/go-controller/`

Deploys to the `uds-system` namespace with the same RBAC permissions as Pepr.

## Build & Run (first time)

```bash
uds run dev-setup
```

This creates the k3d cluster, builds the Go controller image, and deploys everything.

## Rebuild after code changes

```bash
uds run redeploy-go-controller
```

Rebuilds the image, loads it into k3d, and restarts the pod.

## Verify

```bash
uds zarf tools kubectl get pods -n uds-system
uds zarf tools kubectl logs -n uds-system deployment/uds-controller
```
