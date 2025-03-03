# Manifests to test the proposed egress gateway features in a dev uds cluster

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

Simple egress gateway that allows traffic to httpbin.org, but only via https, from curl1 app.

1. Deploy curl workloads: `kubectl apply -f ./basic-egress-gateway/pkg.yaml`
    * Test access to httpbin.org is blocked from the curl pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    000
    ```
    * egress-resources contains the egress-related Istio resources, include netpol

2. Deploy egress-resources (egress gateway, service entry, virtual service, destination rule and network policy): `kubectl apply -f ./basic-egress-gateway/egress-resources.yaml`
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

3. From curl2 pod, test access to httpbin.org - should not work
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://httpbin.org/headers
    000
    ```

## Test with wildcards

Egress test case with wildcard sub-domain matching, "*.wikipedia.org"

-> Some Wildcard rules
* Can use "*" for Gateway hosts, not VirtualService or ServiceEntry hosts
* Can use "*.host.com" for VirtualService, not ServiceEntry hosts
    * Need to use a valid matching host for ServiceEntry hosts, e.g., www.host.com

Probably will omit wildcard usage in the egress configuration, as this gets complicated when moving to ServiceEntry.

1. Deploy pkg and egress-resources: `kubectl apply -f ./wildcard/pkg.yaml && kubectl apply -f ./wildcard/egress-resources.yaml`
    * Test access to wikipedia.org is blocked from the curl pod
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://en.wikipedia.org/wiki/Main_Page
    200
    ```

## Test blocking across namespaces

Now with both the previous packages running, try to access wikipedia from curl1 pod.

1. From curl1 pod, test access to wikipedia.org - should not work
    ```
    /home/curl_user $ curl -o /dev/null -s -w "%{http_code}\n" https://en.wikipedia.org/wiki/Main_Page
    000
    ```
