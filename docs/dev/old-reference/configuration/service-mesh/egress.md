---
title: Istio Egress
tableOfContents:
  maxHeadingLevel: 4
---

UDS Core leverages Istio to route dedicated egress out of the service mesh. This document provides an overview and examples of the Istio resources that UDS Core deploys to handle egress.

## Configuring the Egress Workload

### Ambient

For workloads running in ambient mode, the dedicated egress waypoint is automatically included in UDS Core. It comes pre-enabled and deploys waypoint workloads to the `istio-egress-ambient` namespace.

Additional configurations for the waypoint can be added in the form of helm overrides to the `uds-istio-egress-config` chart in the UDS Bundle, such as:

```yaml
overrides:
  istio-egress-ambient:
    uds-istio-egress-config:
      values:
        - path: "config.deployment.replicas"
          value: 4
        - path: "config.horizontalPodAutoscaler.minReplicas"
          value: 2
```

See the [values.yaml](https://github.com/defenseunicorns/uds-core/tree/main/src/istio/charts/uds-istio-egress-config/values.yaml) for additional details and configuration options.

### Sidecar

For workloads running in sidecar mode, the dedicated egress gateway is an *optional* component of UDS Core and will need to be manually enabled. To enable it in the UDS Bundle, add it to the `optionalComponents` as follows:

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
      values:
        - path: "service.ports"
          value:
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

This passes through to the upstream [Istio gateway chart](https://github.com/istio/istio/tree/master/manifests/charts/gateway), so any other overrides to that chart can follow this format.

## Specifying Egress using the Package CR

The UDS Core Package Custom Resource (CR) is used to configure the egress workload. The egress routes are realized through the use of the `network.allow` - specifically the `remoteHost`, `remoteProtocol`, and `port` or `ports` parameters therein.

:::note
Currently, only HTTP and TLS protocols are supported. The configuration will default to TLS if not specified.
:::

:::note
Wildcards in host names are NOT currently supported.
:::

:::caution
Adding any `remoteHost` in Ambient uses the shared egress waypoint in `istio-egress-ambient`. The operator creates a per‑host `ServiceEntry` and `AuthorizationPolicy` there. Only the namespaces/service accounts included by the operator for that host will be allowed.

`remoteGenerated: Anywhere` makes that allowlist broader (effectively "allow from anywhere" for that host/port). Even though this is just about who is allowed to connect, some workloads may notice differences once traffic is routed through the shared ambient egress path (TLS/HTTP behavior).

Recommendations:
- Prefer explicit `remoteHost` entries and scope with `serviceAccount` (SA‑first).
- Re‑verify critical egress after adding or changing `remoteHost` in any namespace.
:::

### Ambient Mode

The following sample Package CR shows configuring egress to a specific host, "httpbin.org", on port 443.

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: pkg-1
  namespace: egress-gw-1
spec:
  network:
    serviceMesh:
      mode: ambient
    allow:
      - description: "Example Curl"
        direction: Egress
        port: 443
        remoteHost: httpbin.org
        remoteProtocol: TLS
        selector:
          app: curl
        serviceAccount: curl
```

When a Package CR specifies the `network.allow` field with, at minimum, the `remoteHost` and `port` or `ports` parameters, the UDS Operator will create the necessary Istio resources to allow traffic to egress from the mesh. For ambient, the `serviceAccount` should be specified if your workload is not using the default service account. The resources that are created include the following:
* A shared Istio ServiceEntry, in the `istio-egress-ambient` namespace, one per external host across all Ambient packages. This registers the external service (host and union of ports/protocols) and binds it to the egress waypoint.
* A centralized Istio AuthorizationPolicy, in the `istio-egress-ambient` namespace, that targets the per-host ServiceEntry (not the waypoint Gateway) and ALLOWs owners and Ambient "Anywhere" participants (ServiceAccount-first principal, else namespace). Rules use only `from:` sources; the destination host is implied by the ServiceEntry target.
* The shared Istio Waypoint (`Gateway`), in the `istio-egress-ambient` namespace, used to route ambient egress traffic.

#### Limitations

Due to Istio limitations and the selected implementation of shared waypoint egress, if two different egress requests in different packages specify the same host (e.g., pkg1 -> example.com AND pkg2 -> example.com) but request different port or protocols (e.g., pkg1 -> example.com:443/TLS AND pkg2 -> example.com:80/HTTP), the second request will be blocked during reconciliation and the package will fail to reconcile.

### Sidecar Mode

The following sample Package CR shows configuring egress to a specific host, "httpbin.org", on port 443.

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: pkg-1
  namespace: egress-gw-1
spec:
  network:
    serviceMesh:
      mode: sidecar
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

#### Limitations

The configuration in Package CRs in combination with the behavior of Istio should be understood when using egress for sidecar workloads. There are a few "gotchas" that might occur while using the sidecar egress configurations.

* Specifying a port in a Package that is not exposed via the workload: This will be allowed with a warning from the operator, but the traffic will not be able to egress. An `istioctl analyze` will show an error such as: `Referenced host:port not found: "egressgateway.istio-egress-gateway.svc.cluster.local:9200"`

* Specifying a remote host that is also used in other Gateways or VirtualServices: This will be allowed with a warning from the operator, but some unexpected behavior may occur. An `istioctl analyze` will show an error such as: `The VirtualServices ... define the same host ... which can lead to unexpected behavior` and `Conflict with gateways ...`

* For all egresses defined within a single Package CR, all workloads that also have egress will have shared access to any host defined

## Security Considerations

Additional security considerations to keep in mind when implementing egress:

* The TLS mode is PASSTHROUGH, this means that traffic will exit the mesh as-is. Without TLS origination, details like HTTP paths cannot be inspected, restricted or logged.

* Per Istio documentation: “The cluster administrator or the cloud provider must ensure that no traffic leaves the mesh bypassing the egress gateway. Mechanisms external to Istio must enforce this requirement” - Essentially, additional work may be needed to ensure traffic is actually egressing the cluster when and where it should be.

* Some potential vulnerabilities are introduced using TLS Passthrough - you’ll need to know what’s on the other side of that domain because of [domain fronting](https://en.wikipedia.org/wiki/Domain_fronting) - Essentially, this is only a safe feature for trusted hosts, or hosts you know are not vulnerable to domain fronting

* We are not blocking DNS exfiltration

## Troubleshooting

Egress not working? Some things to try:

- `google.com` is not the same as `www.google.com` - Does your `remoteHost` match the request?
- Do your selectors and serviceAccounts match the workloads you expect?
- Check `istioctl analyze -n <egress-namespace>` for any errors
- Check `istioctl proxy-config listeners <egress-pod> -n <egress-namespace>` for expected routes
