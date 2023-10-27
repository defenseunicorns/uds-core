# uds-capability-prometheus-stack

UDS Capability for Prometheus-Stack using [kube-prometheus-stack](https://github.com/prometheus-operator/kube-prometheus) (except Grafana)

## Prerequisites

- zarf installed
- k8s cluster (local or external) v1.26+
- working kube context

## Create

```bash
zarf package create --confirm
```

## Deploy

```bash
zarf package deploy --confirm zarf-package-*.tar.zst
```

## Remove

```bash
zarf package remove --confirm deploy uds-capability-prometheus-stack
```
