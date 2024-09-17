---
title: DNS Configuration
type: docs
weight: 2
---

UDS Core deploys two Gateways by default - a Tenant Gateway for end-user applications and an Admin Gateway for administrative applications. You can read more about Istio configuration in UDS Core [here](https://uds.defenseunicorns.com/core/configuration/istio/ingress/). This section covers how to configure DNS for these Gateways.

### Host Name Configuration
Each Gateway is associated to a wildcard DNS entry that is derived from the `DOMAIN` [variable](https://github.com/defenseunicorns/uds-core/blob/e624d73f79bd6739b6808fbdbf5ca75ebb7c1d3c/src/istio/zarf.yaml#L8) in the UDS Core Istio package. When deploying UDS Core, you can expect two Gateways to be created that match the following domain names:
- *.<DOMAIN> / Tenant Gateway
- *.admin.<DOMAIN> / Admin Gateway

{{% alert-note %}}
The default value for `DOMAIN` is `uds.dev`, which is intended for development purposes only. For non-development purposes, you should override this value by specifying a value for `domain` in your `uds-config.yaml`. You can read more about overriding variables [here](https://uds.defenseunicorns.com/cli/quickstart-and-usage/#variables-and-configuration). 
{{% /alert-note %}}

You can find each Gateway resource in a dedicated namespace:
```cli
$ kubectl get gateway -A
NAMESPACE              NAME             AGE
istio-admin-gateway    admin-gateway    1h
istio-tenant-gateway   tenant-gateway   1h
```

### Bundle Configuration
{{% alert-note %}}
UDS Core does not include any cloud provider specific configuration by default. Additional overrides are required to deploy UDS Core on a given provider. This section will refer to AWS, but values can be subsituted as needed for other providers.
{{% /alert-note %}}

The Admin and Tenant Gateways will be each be bound to an external LoadBalancer that is exposed on TCP ports 80 and 443 by default. The Admin Gateway should be configured to use an internal facing LoadBalancer and the Tenant Gateway should be configured to use an external facing LoadBalancer. Below is an example of overrides that would accomplish this:
```yaml
kind: UDSBundle
metadata:
  name: core-with-lb-config
  description: A UDS example bundle for deploying UDS Core with external Load Balancer configuration
  version: "0.0.1"
  
shared:
  domain: yourawesomedomain.com #overrides default value of uds.dev

packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: 0.27.0-upstream

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
{{% alert-note %}}
These service annotaions and their values are subject to change. Please reference documentation from your cloud provider to ensure their validity.
{{% /alert-note %}}

From here, you may create DNS records to associate each LoadBalancer with its appropriate domain name.