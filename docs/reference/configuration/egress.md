---
title: Istio Egress
---

UDS Core leverages Istio to route dedicated egress out of the service mesh. This document provides an overview and examples of the Istio resources that UDS Core deploys to handle egress.

> [!NOTE] This is only usable for workloads implementing an Istio sidecar proxy

## Configuring the Egress Workload

The dedicated egress workload is an *optional* component of UDS Core. To enable it in the UDS Bundle...

```yaml

```

You will also need to configure any additional ports that you'd expect to egress to. 443 and 80 are default out of the box, but in the case of modifications you should use the overrides as follows:

```yaml

```

## Specifying Egress using the Package CR

The UDS Core Package Custom Resource (CR) is used to configure the egress workload. The egress routes are realized through the use of the `network.allow` - specifically the `remoteHost`, `remoteProtocol`, and `port` or `ports` parameters therein.

> [!NOTE] Currently, only HTTP and TLS protocols are supported. The configuration will default to TLS if not specified.

When a Package CR specifies the `network.allow` field with, at minimum, the `remoteHost` and `port` or `ports` parameters, the UDS Core operator will create the necessary Istio resources to allow traffic to egress from the mesh. These include the following:
* A ServiceEntry CR, in the package namespace, which is used to define the external service that the workload can access.
* A Sidecar CR, in the package namespace, which is used to enforce that only registered traffic can egress from the workload.
* A VirtualService CR, in the istio egress gateway namespace, which is used to route the traffic to the egress gateway.
* A Gateway CR, in the istio egress gateway namespace, which is used to expose the egress gateway to the outside world.

The following provide some examples for the configuration of egress using the Package Custom Resource. 

### ...

```yaml

```

## Limitations

The configuration Package CRs in combination with the behavior of Istio should be understood when using egress. There are a few "gotchas" that might occur while using the egress configurations.

> [!NOTE] The following are not exhaustive and are subject to change as this implementation matures from sidecar to ambient.

* Specifying a port in a Package that is not exposed via the workload: This will be allowed, but the traffic will not be able to egress. 

* Specifying a remote host that is also used in other Gateways or VirtualServices: ... 

* Specifying different port/protocol combinations in different Package CRs: Different packages will be able to access all port/protocols because of shared service entries

* The TLS mode is PASSTHROUGH, this means that traffic will exit the mesh as-is. Without TLS origination, details like HTTP paths cannot be inspected, restricted or logged.

## Security Considarations

Additional security considerations to keep in mind when implementing egress:

* Per Istio documentation: “The cluster administrator or the cloud provider must ensure that no traffic leaves the mesh bypassing the egress gateway. Mechanisms external to Istio must enforce this requirement” - Essentially, additional work may be needed to ensure traffic is actually egressing the cluster when and where it should be.

* Some potential vulnerabilities are introduced using TLS Passthrough - you’ll need to know what’s on the other side of that domain because of [domain fronting](https://en.wikipedia.org/wiki/Domain_fronting) - Essentially, this is only a safe feature for trusted hosts, or hosts you know are not vulnerable to domain fronting

* We are not blocking DNS exfiltration
