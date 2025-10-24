---
title: DNS Configuration
---

UDS Core deploys two Gateways by default - a Tenant Gateway for end-user applications and an Admin Gateway for administrative applications. You can read more about Istio configuration in UDS Core [here](https://uds.defenseunicorns.com/reference/configuration/ingress/). This section covers how to configure DNS for these Gateways.

### Domain Configuration

Each Gateway requires a wildcard DNS entry corresponding with the chosen `DOMAIN` and `ADMIN_DOMAIN` [variables](https://github.com/defenseunicorns/uds-core/blob/f6b0b59060a14febd11b0cdc7480f853a57f8520/src/istio/zarf.yaml#L10-L16) (or `admin.<DOMAIN>` if not specifying a separate admin domain). When deploying UDS Core, you can expect two Gateways to be created that match the following domain names:
- `*.<DOMAIN>` / Tenant Gateway
- `*.<ADMIN_DOMAIN>` / Admin Gateway if setting `ADMIN_DOMAIN`
- `*.admin.<DOMAIN>` / Admin Gateway if NOT setting `ADMIN_DOMAIN`

:::note
Wildcard records do not cover the root (apex) domain itself. If you need to serve applications directly on the root (for example, `uds.dev`), see [Istio Ingress docs](https://uds.defenseunicorns.com/reference/configuration/ingress/).
:::

:::note
The default value for `DOMAIN` is `uds.dev`, which is intended for development purposes only. For non-development purposes, you should override this value by specifying a value for `domain` in your `uds-config.yaml`. You can find instructions on how to do so [here](https://uds.defenseunicorns.com/reference/configuration/ingress/#configure-domain-name-and-tls-for-istio-gateways).
:::

### Bundle Configuration

:::note
UDS Core does not include any cloud provider specific configuration by default. Additional overrides are required to deploy UDS Core on a given provider. This section will refer to AWS, but values can be substituted as needed for other providers.
:::

The Admin and Tenant Gateways will be each be bound to an external Load Balancer that is exposed on TCP ports 80 and 443 by default. The Admin Gateway should be configured to use an internal facing Load Balancer and the Tenant Gateway should be configured to use an external facing Load Balancer. Below is an example of overrides that would accomplish this:
```yaml
kind: UDSBundle
metadata:
  name: core-with-lb-config
  description: A UDS example bundle for deploying UDS Core with external Load Balancer configuration
  version: "0.0.1"

packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.54.1-upstream

overrides:
 istio-admin-gateway:
   gateway:
     values:
      - path: service.annotations.service\.beta\.kubernetes\.io/aws-load-balancer-type
        value: "external"
      - path: service.annotations.service\.beta\.kubernetes\.io/aws-load-balancer-scheme
        value: "internal"
      - path: service.annotations.service\.beta\.kubernetes\.io/aws-load-balancer-attributes
        value: "load_balancing.cross_zone.enabled=true"
  istio-tenant-gateway:
    gateway:
      values:
      - path: service.annotations.service\.beta\.kubernetes\.io/aws-load-balancer-type
        value: "external"
      - path: service.annotations.service\.beta\.kubernetes\.io/aws-load-balancer-scheme
        value: "internet-facing"
      - path: service.annotations.service\.beta\.kubernetes\.io/aws-load-balancer-attributes
        value: "load_balancing.cross_zone.enabled=true"
```

### Istio Gateways
Once UDS Core is deployed, there will be Istio Gateway resources in your cluster. You can find each Gateway in a dedicated namespace:
```console
$ kubectl get gateway -A
NAMESPACE              NAME             AGE
istio-admin-gateway    admin-gateway    1h
istio-tenant-gateway   tenant-gateway   1h
```

Each Gateway will have a Kubernetes Service of type Load Balancer:
```console
$ kubectl get svc -A | grep LoadBalancer
NAMESPACE                   NAME                                             TYPE           CLUSTER-IP      EXTERNAL-IP                                        PORT(S)                                     AGE
istio-admin-gateway         admin-ingressgateway                             LoadBalancer   10.43.82.84     k8s-istioadm-admin...elb.us-east-1.amazonaws.com   15021:30842/TCP,80:31304/TCP,443:31518/TCP  1h
istio-tenant-gateway        tenant-ingressgateway                            LoadBalancer   10.43.47.182    k8s-istioten-tenant...elb.us-east-1.amazonaws.com  15021:31222/TCP,80:30456/TCP,443:32508/TCP  1h
```

From here, you can register your domain and/or create DNS records for your environment that point to the appropriate Gateways/Load Balancers. Refer to your DNS provider's documentation.
