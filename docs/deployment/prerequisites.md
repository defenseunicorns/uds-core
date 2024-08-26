---
title: UDS Prerequisites
type: docs
weight: 4
---

## UDS installation prerequisites

`UDS Core` can run in any CNCF conformant [Kubernetes](https://www.cncf.io/training/certification/software-conformance/) setup, but sometimes customizations are needed based on environments. This is an attempt to document and link to relevant information to aid in setting up your Kubernetes environment and hosts to ensure a successful `UDS Core` installation.  

### RHEL
---
#### *ISTIO related changes*
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

### RKE2
--- 
* [Installation requirements](https://docs.rke2.io/install/requirements)
* [Firewalld network conflicts](https://docs.rke2.io/known_issues#firewalld-conflicts-with-default-networking)
* [Disabling components, such as Ingress which clashes with istio](https://docs.rke2.io/advanced#disabling-server-charts)
* [Defense Unicorns os prep script for rke2](https://github.com/defenseunicorns/uds-rke2-image-builder/blob/main/packer/scripts/os-prep.sh)


### K3S
---
* [OS requirements](https://docs.k3s.io/installation/requirements#operating-systems)



### UDS Core components
---
#### UDS Operator
#### Istio 
* [Platform requirements](https://istio.io/latest/docs/ops/deployment/platform-requirements/)
#### Keycloak
* [Configuration guide](https://www.keycloak.org/keycloak-benchmark/kubernetes-guide/latest/)
#### Neuvector
#### Loki
#### Prometheus
#### Promtail
#### Grafana
#### Authservice
#### Velero
#### Metrics Server
* Optional component and can be added if needed. Most of the provided managed clusters will provide you a metric server.
```yaml
...
- name: uds-core
  repository: ghcr.io/defenseunicorns/packages/private/uds/core
  ref: 0.25.2-unicorn
  optionalComponents:
    - metrics-server
...
```

