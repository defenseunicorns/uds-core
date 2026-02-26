---
title: L7 Load Balancer
---

UDS Core Gateways can be used with L7 Load Balancers (commonly referred as Application Load Balancers or Application Gateways) connected to one of both Istio Gateways. This allows you to leverage the ALB's capabilities for routing, SSL termination, and other features while still using Istio for service mesh functionality. Such setups are highly dependent on the Cloud Provider configuration but usually require:

* Disabling HTTPS redirects in Istio gateways.
* Setting the number of trusted proxies to one, with the ALB acting as the trusted proxy.
* Configuring Keycloak to accept the client certificate from the L7 Load Balancer.

The most common setup has been covered in the [Using an L7 Load Balancers with UDS Core Gateways](/reference/configuration/service-mesh/ingress/) part of the documentation.
