---
title: Istio Egress
---

UDS Core leverages Istio to route dedicated egress out of the service mesh. This document provides an overview and examples of the Istio resources that UDS Core deploys to handle egress.

:::note
This does not currently work with ambient mode enabled (`spec.network.serviceMesh.mode=ambient`) or with workloads that omit the sidecar proxy
:::

## Configuring the Egress Workload

The dedicated egress gateway is an *optional* component of UDS Core. To enable it in the UDS Bundle, add it to the `optionalComponents` as follows:

```yaml
kind: UDSBundle
metadata:
  name: uds-core-bundle
  description: My UDS Core Bundle
  version: "0.1.0"

packages:
  - name: uds-core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    version: "0.39.0"
    optionalComponents:
      - istio-egress-gateway
```

You will also need to configure any additional ports that you'd expect to egress to. 443 and 80 are default out of the box, but in the case of modifications you should use the `packages.overrides` as follows:

```yaml
overrides:
  istio-egress-gateway:
    gateway:
      ports:
        - name: status-port
          port: 15021
          protocol: TCP
          targetPort: 15021
        - name: http2
          port: 80
          protocol: TCP
          targetPort: 80
        - name: https
          port: 443
          protocol: TCP
          targetPort: 443
        - name: custom-port
          port: 9200
          protocol: TCP
          targetPort: 9200
```

## Specifying Egress using the Package CR

The UDS Core Package Custom Resource (CR) is used to configure the egress workload. The egress routes are realized through the use of the `network.allow` - specifically the `remoteHost`, `remoteProtocol`, and `port` or `ports` parameters therein.

:::note
Currently, only HTTP and TLS protocols are supported. The configuration will default to TLS if not specified.
:::

:::note
Wildcards in host names are NOT currently supported.
:::

The following sample Package CR shows configuring egress to a specific host, "httpbin.org", on port 443. 

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: pkg-1
  namespace: egress-gw-1
spec:
  network:
    allow:
      - description: "Example Curl"
        direction: Egress
        port: 443
        remoteHost: httpbin.org
        remoteProtocol: TLS
        selector:
          app: curl
```

When a Package CR specifies the `network.allow` field with, at minimum, the `remoteHost` and `port` or `ports` parameters, the UDS Core operator will create the necessary Istio resources to allow traffic to egress from the mesh. These include the following:
* An Istio ServiceEntry, in the package namespace, which is used to define the external service that the workload can access.
* An Istio Sidecar, in the package namespace, which is used to enforce that only registered traffic can egress from the workload. This is only applied to the workload selected in the `network.allow`.
* A shared Istio VirtualService, in the istio egress gateway namespace, which is used to route the traffic to the egress gateway.
* A shared Istio Gateway, in the istio egress gateway namespace, which is used to expose the egress gateway to the outside world.
* A shared Istio Service Entry, in the istio egress gateway namespace, to register the hosts and the ports for the egress gateway.

## Limitations

The configuration in Package CRs in combination with the behavior of Istio should be understood when using egress. There are a few "gotchas" that might occur while using the egress configurations.

:::note
The following are not exhaustive and are subject to change as this implementation matures from sidecar to ambient.
:::

* Currently, egress will only work for workloads that are using the Istio sidecar proxy.

* Specifying a port in a Package that is not exposed via the workload: This will be allowed with a warning from the operator, but the traffic will not be able to egress. An `istioctl analyze` will show an error such as: `Referenced host:port not found: "egressgateway.istio-egress-gateway.svc.cluster.local:9200"`

* Specifying a remote host that is also used in other Gateways or VirtualServices: This will be allowed with a warning from the operator, but some unexpected behavior may occur. An `istioctl analyze` will show an error such as: `The VirtualServices ... define the same host ... which can lead to unexpected behavior` and `Conflict with gateways ...`

* For all egresses defined within a single Package CR, all workloads that also have egress will have shared access to any host defined (is that true with the VS?)

## Security Considarations

Additional security considerations to keep in mind when implementing egress:

* The TLS mode is PASSTHROUGH, this means that traffic will exit the mesh as-is. Without TLS origination, details like HTTP paths cannot be inspected, restricted or logged.

* Per Istio documentation: “The cluster administrator or the cloud provider must ensure that no traffic leaves the mesh bypassing the egress gateway. Mechanisms external to Istio must enforce this requirement” - Essentially, additional work may be needed to ensure traffic is actually egressing the cluster when and where it should be.

* Some potential vulnerabilities are introduced using TLS Passthrough - you’ll need to know what’s on the other side of that domain because of [domain fronting](https://en.wikipedia.org/wiki/Domain_fronting) - Essentially, this is only a safe feature for trusted hosts, or hosts you know are not vulnerable to domain fronting

* We are not blocking DNS exfiltration
