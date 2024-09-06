---
title: UDS Package Custom Resource
type: docs
weight: 2
---

UDS Package CR (Custom Resource) is a Kubernetes custom resource definition used to define and configure a UDS Package in the UDS Core platform. It allows specifying various configurations for the package, such as network policies, service exposure, monitoring, and SSO (Single Sign-On) settings.

The main sections of a UDS Package CR are:

1. `metadata`: Contains the name and namespace of the package.

2. `spec.network`: Defines network-related configurations.
   - `expose`: Specifies services to expose via Istio VirtualServices and related network policies. 
   - `allow`: Defines NetworkPolicy rules for allowing traffic to/from the package.

3. `spec.sso`: Configures SSO settings for the package, such as creating Keycloak clients and generating secrets.

4. `spec.monitor`: Configures Service or Pod Monitors for the package to enable monitoring and metrics collection.

Here's an example UDS Package CR:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-namespace
spec:
  network:
    expose:
      - service: my-service
        host: my-app.example.com
        port: 80
    allow:
      - direction: Egress
        remoteNamespace: other-namespace
        port: 8080
  sso:
    - name: My App SSO
      clientId: my-app-client
      redirectUris:
        - "https://my-app.example.com/login"
  monitor:
    - portName: metrics
      targetPort: 8080
      selector:
        app: my-app
```

This UDS Package exposes `my-service` on `my-app.example.com`, allows egress traffic to `other-namespace` on port 8080, sets up an SSO client for the application, and configures a ServiceMonitor to collect metrics from pods with the label `app: my-app` on port 8080.

The UDS Operator watches for UDS Package CRs and manages the lifecycle of associated resources like NetworkPolicies, Istio VirtualServices, Keycloak clients, and Service/Pod Monitors based on the CR configuration.

# Network Configuration

The `spec.network` field in the UDS Package custom resource allows configuring network policies and exposing services. It has the following sub-fields:

## allow

`allow` is an array of objects representing network policies to allow specific traffic to/from the package namespace. Each `allow` object has the following fields:

- `description` (string, optional): A description of the policy. This will become part of the generated NetworkPolicy name.

- `direction` (string, required): The direction of the traffic, either "Ingress" or "Egress".

- `labels` (object, optional): Additional labels to apply to the generated NetworkPolicy.

- `port` (number, optional): The port number to allow traffic on. Only TCP protocol is supported.

- `ports` (number[], optional): A list of port numbers to allow traffic on. Only TCP protocol is supported.

- `remoteNamespace` (string, optional): The remote namespace to allow traffic to/from. Use "*" or empty string to allow all namespaces.

- `remoteSelector` (object, optional): The pod selector labels in the remote namespace to allow traffic to/from.

- `selector` (object, optional): Labels to select pods in the package namespace to apply the policy to. Leave empty to select all pods.

- `remoteGenerated` (string, optional): Custom remote selector to allow traffic to/from specific IPs or ranges. Allowed values are "Anywhere", "CloudMetadata", "IntraNamespace", "KubeAPI".

## expose

`expose` is an array of objects representing services to expose via Istio VirtualServices. Each `expose` object has the following fields:

- `description` (string, optional): A description of this expose entry. This will become part of the generated VirtualService name.

- `host` (string, required): The hostname to expose the service on.

- `gateway` (string, optional, default: "tenant"): The name of the gateway to expose the service on. Allowed values are "admin", "tenant", "passthrough".

- `service` (string, optional): The name of the Kubernetes service to expose. Required if not using `advancedHTTP`.

- `port` (number, optional): The port number of the Kubernetes service to expose. Required if `service` is specified and not using `advancedHTTP`.

- `targetPort` (number, optional): The target port of the Kubernetes service. This defaults to port and is only required if the service port is different from the target port (so the NetworkPolicy can be generated correctly).

- `selector` (object, optional): Labels to select pods backing the exposed service.

- `advancedHTTP` (object, optional): Advanced HTTP routing rules for the exposed service. Cannot be used with `service` and `port`. Has the following sub-fields:
  - `match` (object[], optional): Conditions to match HTTP requests.
  - `rewrite` (object, optional): Rewrite HTTP URIs and Authority headers.
  - `timeout` (string, optional): Timeout for HTTP requests.
  - `retries` (object, optional): Retry policy for HTTP requests.
  - `corsPolicy` (object, optional): Cross-Origin Resource Sharing (CORS) policy.

## Example

```yaml
spec:
  network:
    allow:
      - direction: Ingress
        port: 80
        remoteNamespace: other-ns
      - direction: Egress  
        ports: [443, 8080]
        remoteSelector:
          app: backend
    expose:
      - host: example.com
        service: frontend
        port: 80
      - host: api.example.com
        advancedHTTP:
          match:
            - uri:
                prefix: /api
          corsPolicy:
            allowOrigins:
              - exact: https://example.com
```

This example allows ingress traffic on port 80 from `other-ns`, allows egress traffic on ports 443 and 8080 to pods with label `app: backend`, exposes the `frontend` service on `example.com`, and exposes an API with CORS enabled on `api.example.com`.

# SSO Configuration

The `spec.sso` field in the UDS Package custom resource allows configuring SSO clients for the package. It is an array of objects, where each object represents an SSO client. The following fields are available for each SSO client:

## Required Fields

- `clientId` (string, required): The client identifier registered with the identity provider.

- `name` (string, required): The display name of the client.

## Optional Fields

- `alwaysDisplayInConsole` (boolean, optional): If true, always list this client in the Account UI, even if the user does not have an active session.

- `attributes` (object, optional): Specifies additional attributes for the client.

- `clientAuthenticatorType` (string, optional): The client authenticator type. Allowed values are "client-jwt" and "client-secret".

- `defaultClientScopes` (string[], optional): Default client scopes.

- `description` (string, optional): A description for the client. Can be a URL to an image to replace the login logo.

- `enabled` (boolean, optional): Whether the SSO client is enabled. Defaults to true.

- `groups` (object, optional): Specifies the groups allowed to access the client. Has the following sub-field:
  - `anyOf` (string[], optional): List of group names.

- `protocol` (string, optional): The protocol of the client. Allowed values are "openid-connect" and "saml". Defaults to "openid-connect".

- `publicClient` (boolean, optional): Defines whether the client requires a client secret for authentication. Defaults to false.

- `redirectUris` (string[], optional): Valid URI patterns a browser can redirect to after a successful login. Simple wildcards are allowed, e.g., "https://example.com/*".

- `rootUrl` (string, optional): Root URL appended to relative URLs.

- `secret` (string, optional): The client secret. Typically left blank and auto-generated.

- `secretName` (string, optional): The name of the Kubernetes secret to store the client secret.

- `secretTemplate` (object, optional): A template for the generated secret, with key-value pairs.

- `standardFlowEnabled` (boolean, optional): Enables the standard OpenID Connect redirect-based authentication

Citations:
