---
title: Non-HTTP(s) Istio Ingress
---

As noted in the [Istio Ingress document](https://uds.defenseunicorns.com/reference/configuration/ingress/), UDS Core by default provides gateway configuration to handle HTTP(s) ingress traffic only. This document provides example configuration and resources to setup ingress for a non-http service (using SSH for the example below). Note that while this example uses port 22 and the SSH protocol this same process should work for an TCP port/protocol that your service is listening on.

## UDS Core Configuration

In order to allow ingress for a non-HTTP service you first need to configure the UDS Core loadbalancers to accept traffic on a different port. This can be done via an override to the configuration for the admin or tenant loadbalancers, as shown in the example below for the tenant loadbalancer to add port 22:

```yaml
  - name: core
    repository: ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x
    overrides:
      istio-tenant-gateway:
        gateway:
          values:
            - path: "service.ports"
              value:
                # Default ports for status, http, and https
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
                # Any additional ports required for ingress
                - name: tcp-ssh
                  port: 2022 # The external port that is exposed
                  protocol: TCP
                  targetPort: 22 # The port to route to on the Gateway
```

Note that you _MUST_ include the default list of ports (as shown above) to ensure that HTTP traffic and liveness checks continue to function as expected. You can choose any `port` and `targetPort` for your additional configuration that you want.

## Gateway Custom Resource

In order to allow exposing services through the newly opened loadbalancer port you must also create an [Istio Gateway](https://istio.io/latest/docs/reference/config/networking/gateway/) custom resource that specifies the hosts and port that you want to configure the gateway to accept requests for. The below example shows how to do this for `example.uds.dev` on our SSH port of 22:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: example-ssh-gateway
  # This must be the namespace of the ingressgateway you configured the port for
  namespace: istio-tenant-gateway
spec:
  selector:
    app: tenant-ingressgateway
  servers:
    - hosts:
      # This should be the host you expect to hit with requests
      - example.uds.dev
      port:
        name: tcp-ssh
        # This must match the `targetPort` you added to the port list above
        number: 22
        protocol: TCP
```

## VirtualService Custom Resource

Now that the loadbalancer and Istio Gateway are configured for the right ports and host, you will just need to add a route (`VirtualService`) to ensure traffic is directed to the right cluster service when requests come to your host and port. The example below does this for our `example.uds.dev` host:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: example-ssh
  # This must be in the namespace of your application
  namespace: example
spec:
  gateways:
    # This must match the namespace/name of the Gateway you created
    - istio-tenant-gateway/example-ssh-gateway
  hosts:
    - example.uds.dev
  tcp:
    - match:
        # This must match the Gateway port number you added above
        - port: 22
      route:
        - destination:
            # This should be the full cluster service address
            host: example.example.svc.cluster.local
            port:
              # This is the port on the service you want to route to
              number: 22
```

Assuming you are running with strict network policies you will also need to add a network policy to allow ingress on this same port. You can do this in the Package CR like the example below:

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        selector:
          app: example
        # These must line up with the gateway you chose
        remoteNamespace: istio-tenant-gateway
        remoteSelector:
          app: tenant-ingressgateway
        # This must line up with the port exposed on the pod
        port: 22
        description: "SSH Ingress"
...
```

With these steps complete you should be able to hit your application over the port you configured on the configured host, so in our case we should be able to run:

```console
ssh -p 2022 user@example.uds.dev
```
