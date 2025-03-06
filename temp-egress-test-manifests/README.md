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

## Add everything to the egress gateway namespace - same hosts allowed

This sets up the resources (Gateway, VirtualService, and DestinationRule) in the egress gateway namespace, but the ServiceEntry in the package's namespace. This is to validate behavior when these resources are in a common namespace.

1. Deploy pkgs and egress resources in `global-ns-same-host`
  * Test curl1 can access example.com
  ```
  curl https://example.com
  ```
  * Test curl2 can access example.com
  ```
  curl https://example.com
  ```

2. Deploy the test auth policy (`test-ap.yaml`) to show that authorization policy will not match
  * From curl1, curl https://example.com -> Error
  * Gateway logs -> `rbac_access_denied_matched_policy[none]`
    * The policy is not matching here due to the `from.source.namespaces` field - no tls identity provided by the source due to tls passthrough

## Global Namespace, Different hosts allowed

This is the same example as previous, but with httpbin.org for curl2. This demonstrates that the service entry `exportTo` restriction limits the hosts that can be accessed, cross-namespace.

1. Deploy pkgs and egress resources in `global-ns-different-host`
  * Test curl1 can access example.com
  ```
  curl https://example.com
  ```
  * Test curl1 cannot access httpbin.org
  ```
  curl https://httpbin.org/headers
  ```
  * Test vice versa is true for curl2

## Low budget service entry registry name only - sidecar restrict egress

This is a "low budget" approach that essentially blocks egress via the sidecar proxy. Essentially, we use the built-in netpol generation (egress, to anywhere) but with the combination of the meshConfig settings (outboundTrafficPolicy.mode=REGISTRY_ONLY) and the service entry, this will restrict egress traffic.

1. Deploy `low-budget/pkg-1.yaml`
  * Test that curl1 cannot access example.com
  ```
  /home/curl_user $ curl https://example.com
  curl: (35) TLS connect error: error:00000000:lib(0)::reason(0)
  ```
2. Deploy `low-budget/service-entry.yaml`
  * Test that curl1 can now access example.com
  ```
  /home/curl_user $ curl https://example.com
  <response>
  ```