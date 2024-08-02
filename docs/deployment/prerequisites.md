---
title: UDS Prerequisites
type: docs
weight: 4
---

## UDS Prerequisites (by components)

These components are what comprise `UDS Core`. Below each, you will find any prerequisites that have been discovered through different deployment scenarios across different environments.

#### Istio

Solution is to create file `/etc/modules-load.d/istio-iptables.conf` with this content:

```bash
# These modules need to be loaded on boot so that Istio (as required by
# UDS Core) runs properly.
#
# See also: https://github.com/istio/istio/issues/23009

br_netfilter
nf_nat
xt_REDIRECT
xt_owner
iptable_nat
iptable_mangle
iptable_filter
```

```bash
sudo systemctl stop firewalld
sudo systemctl disable firewalld
```

#### Pepr

#### Metrics Server

#### Keycloak

#### Neuvector

#### Loki

#### Prometheus

#### Promtail

#### Grafana

#### Authservice

#### Velero
