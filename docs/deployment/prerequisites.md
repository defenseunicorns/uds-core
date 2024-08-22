---
title: UDS Prerequisites
type: docs
weight: 4
---

## UDS installation prerequisites

`UDS Core` could run in any [Kuberentes](https://kubernetes.io/) setup, but sometimes customizations are needed based on environemnts. This is an attempt to document and link to relevant information to aid in setting up your [Kuberentes](https://kubernetes.io/) environment to ensure a successful `UDS Core` installation.  

### RHEL

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


Other Istio documentation:
* https://istio.io/latest/docs/ops/deployment/platform-requirements/

### RKE2 
* https://docs.rke2.io/known_issues#firewalld-conflicts-with-default-networking
* https://docs.rke2.io/install/requirements
* https://github.com/defenseunicorns/uds-rke2-image-builder/blob/main/packer/scripts/os-prep.sh 


### K3S
* https://docs.k3s.io/installation/requirements#operating-systems



#### UDS Core components 
* UDS Operator
* [Istio](https://istio.io/latest/docs/ops/deployment/platform-requirements)
* [Keycloak](https://www.keycloak.org/keycloak-benchmark/kubernetes-guide/latest/)
* Neuvector
* Loki
* Prometheus
* Promtail
* Grafana
* Authservice
* Velero
