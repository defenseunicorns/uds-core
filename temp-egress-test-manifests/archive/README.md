# README

This directory tests a configuration of egress resources to verify traffic egress behavior. This is now deprecated as the "same-host-different-ns" test case fails in this configuration, which makes this a non-starter.

First deploy test UDS Cluster with Istio and Pepr:
(Note, this is using the meshConfig.outboundTrafficPolicy.mode=REGISTRY_ONLY)
```
# Create the dev environment
uds run dev-setup

# If developing the Pepr module:
npx pepr dev

# If not developing the Pepr module (can be run multiple times):
npx pepr deploy

# Deploy the layer (can be run multiple times)
uds run dev-deploy --set LAYER=identity-authorization
```

## Basic Egress Gateway

Simple egress gateway that allows traffic to httpbin.org, but only via https, from curl1 app. Purpose of the test is to verify the basic egress gateway functionality.

1. Deploy curl package and workload: `kubectl apply -f ./basic-egress-gateway/pkg.yaml`
    * Test access to httpbin.org is blocked from the curl pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    000
    ```

2. Deploy Istio egress networking resources (egress gateway, service entry, virtual service, destination rule and network policy): `kubectl apply -f ./basic-egress-gateway/egress-resources.yaml`
    * Test access to httpbin.org is allowed from the curl pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    200
    ```

    * Test accesss to httpbin.org from http protocol - should fail as protocol not supported
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" http://httpbin.org/headers
    502
    ```

    * Test access to google - should not work, no host found
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://google.com
    000
    ```

3. From curl2 pod, test access to httpbin.org - should not work, blocked by network policy
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    000
    ```

## Test with wildcards

Egress test case with wildcard sub-domain matching, "*.wikipedia.org". Purpose of the test is to check the wildcard sub-domain configuration in the egress gateway.

Some Wildcard rules
* Can use "*" for Gateway hosts, not VirtualService or ServiceEntry hosts
* Can use "*.host.com" for VirtualService, not ServiceEntry hosts
    * Need to use a valid matching host for ServiceEntry hosts, e.g., www.host.com
    * Needs to be an entry in the SAN of the certificate to work

> Probably will omit wildcard usage in the egress configuration, as this gets complicated when moving to ServiceEntry.

1. Deploy pkg and egress-resources: `kubectl apply -f ./wildcard/pkg.yaml && kubectl apply -f ./wildcard/egress-resources.yaml`
    * Test access to wikipedia.org is available from the curl pod in `wildcard-test` namespace
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://en.wikipedia.org/wiki/Main_Page
    200
    ```

## Verify traffic blocked across namespaces

Now with both the previous packages running, try to access wikipedia from curl1 pod in `basic-egress-test`. Purpose is to verify that the traffic policies are isolated to the namespace.

1. From curl1 pod, test access to wikipedia.org - should not work
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://en.wikipedia.org/wiki/Main_Page
    000
    ```

## Test with different hosts in the same namespace

Egress test case to access different hosts, "httpbin.org" and "example.com", for two pods in the same namespace. Purpose is to demonstrate traffic to scoped to different workloads in the same namespace is allowed. 

> Probably need Authorization Policies to properly scope the traffic to the workloads.

1. Deploy pkg and egress-resources: `kubectl apply -f ./different-host-same-ns/pkg.yaml && kubectl apply -f ./different-host-same-ns/egress-resources-1.yaml`
  * Verify access to httpbin.org is allowed from the curl1 pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    200
    ```
  * Verify access to example.com is blocked from the curl1 pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://example.com
    000
    ```

2. Deploy egress-resources-2: `kubectl apply -f ./different-host-same-ns/egress-resources-2.yaml`
  * Show access to example.com is not blocked from the curl1 pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://example.com
    200
    ```
  * Verify access to example.com is available from curl2 pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://example.com
    200
    ```
  * Show access to httpbin.org is not blocked from curl2 pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    200
    ```

## Test with different subdomains in different namespaces

Egress test case with different subdomains, "en.wikipedia.org" and "de.wikipedia.org", from different namespaces. Purpose is to validate that traffic is isolated to the namespace when using subdomains(?)... would the wildcard case hold here? If one is accessing all subdomains and the other is just one :grimace:

1. Deploy all resources in `different-subdomain-different-ns` (pkgs first then egress-resources). 
  * From curl1 pod check access to en.wikipedia.org (should just have access to en.wikipedia.org).
  ```
  /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://en.wikipedia.org/wiki/Main_Page
  200
  ```
  * Check access to de.wikipedia.org is blocked
  ```
  /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://de.wikipedia.org/wiki/Main_Page
  000
  ```

2. From curl2, reverse should be true
  ```
  /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://de.wikipedia.org/wiki/Main_Page
  200

  /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://en.wikipedia.org/wiki/Main_Page
  000
  ```

3. Redeploy the wildcard test case in the `wildcard-test` namespace. Purpose is to verify that the wildcard subdomain configuration is isolated to the namespace.

  Try to access fr.wikipedia.org from curl1 pod in `different-subdomain-different-ns` namespace
  ```
  /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://fr.wikipedia.org/wiki/Main_Page
  000
  ```

## Identical host names in different namespaces

Test case where "example.com" host is registered by two different apps, simulating two UDS Packages trying to allow egress access for the same host.

This leads to Istio being sad - should we put everything in the same namespace or have pepr handle this (if a service entry exists with the exact same host name, don't create a new one)

1. Deploy all resources in `identical-host-different-ns` (pkgs first then egress-resources, do egress-resources-2 last). 
  * From curl1 pod check access to example.com
  ```
  /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://example.com
  200
  ```

  * From curl2 pod check access to example.com
  ```
  /home/curl_user $ curl https://example.com
  curl: (35) Recv failure: Connection reset by peer
  ```

2. Run istioctl analyze the namespace:
```
% istioctl analyze -n ns-a
Error [IST0109] (VirtualService ns-a/different-subdomain-through-egress-gateway-1) The VirtualServices ns-a/different-subdomain-through-egress-gateway-1,ns-b/different-subdomain-through-egress-gateway-2 associated with mesh gateway define the same host */example.com which can lead to undefined behavior. This can be fixed by merging the conflicting VirtualServices into a single resource.
Error [IST0145] (Gateway ns-a/different-subdomain-gateway-1) Conflict with gateways ns-b/different-subdomain-gateway-2 (workload selector app=egressgateway, port 443, hosts example.com).
Error: Analyzers found issues when analyzing namespace: ns-a.
See https://istio.io/v1.24/docs/reference/config/analysis for more information about causes and resolutions.
```

--> Looks like there's both a gateway and virtual service conflict... no service entry conflict. If we have pepr deconflict, does one "global" thing get created? Could it be given a label or annotation that multiple packages are using it?