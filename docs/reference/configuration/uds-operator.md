---
title: UDS Operator
---

The UDS Operator plays a pivotal role in managing the lifecycle of UDS Package Custom Resources (CRs) along with their associated resources like NetworkPolicies and Istio VirtualServices. Leveraging [Pepr](https://github.com/defenseunicorns/pepr), the operator binds watch operations to the enqueue and reconciler, taking on several key responsibilities for UDS Packages and exemptions:

## Package

- **Enabling Istio Sidecar Injection:**
  - The operator facilitates the activation of Istio sidecar injection within namespaces where the CR is deployed.
- **Establishing Default-Deny Ingress/Egress Network Policies:**
  - It sets up default-deny network policies for both ingress and egress, creating a foundational security posture.
- **Implementing Layered Allow-List Approach:**
  - A layered allow-list approach is applied on top of default-deny network policies. This includes essential defaults like Istio requirements and DNS egress.
- **Providing Targeted Remote Endpoints Network Policies:**
  - The operator creates targeted network policies for remote endpoints, such as `KubeAPI` and `CloudMetadata`. This approach aims to enhance policy management by reducing redundancy (DRY) and facilitating dynamic bindings in scenarios where static definitions are impractical.
- **Creating Istio Virtual Services and Related Ingress Gateway Network Policies:**
  - In addition, the operator is responsible for generating Istio Virtual Services and the associated network policies for the ingress gateway.
- **SSO Group Authentication:**
  - Group authentication determines who can access the application based on keycloak group membership.
  - At this time `anyOf` allows defining a list of groups, a user must belong to at least one of them.
  - Custom client `protocolMapper`'s that will be created alongside the client and added to the client's dedicated scope.
- **Authservice Protection:**
- Authservice authentication provides application agnostic SSO for applications that opt-in.

:::caution
Warning: **Authservice Protection** and **SSO Group Authentication** are in Alpha and may not be stable. Avoid using in production. Feedback is appreciated to improve reliability.
:::

### Example UDS Package CR

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: grafana
  namespace: grafana
spec:
  network:
    # Expose rules generate Istio VirtualServices and related network policies
    expose:
      - service: grafana
        selector:
          app.kubernetes.io/name: grafana
        host: grafana
        gateway: admin
        port: 80
        targetPort: 3000

    # Allow rules generate NetworkPolicies
    allow:
      - direction: Egress
        selector:
          app.kubernetes.io/name: grafana
        remoteGenerated: Anywhere

      - direction: Egress
        remoteNamespace: tempo
        remoteSelector:
          app.kubernetes.io/name: tempo
        port: 9411
        description: "Tempo"

  # SSO allows for the creation of Keycloak clients and with automatic secret generation and protocolMappers
  sso:
    - name: Grafana Dashboard
      clientId: uds-core-admin-grafana
      redirectUris:
        - "https://grafana.admin.{{ .Values.domain }}/login/generic_oauth"
      groups:
        anyOf:
          - /UDS Core/Admin
      # Define protocolMappers to be created as dedicated scopes for the client
      protocolMappers:
        - name: username
          protocol: "openid-connect"
          protocolMapper: "oidc-usermodel-property-mapper"
          config:
            user.attribute: "username"
            claim.name: "username"
            userinfo.token.claim: "true"
        - name: email
          protocol: "openid-connect"
          protocolMapper: "oidc-usermodel-property-mapper"
          config:
            user.attribute: "email"
            claim.name: "email"
            userinfo.token.claim: "true"
```

### Example UDS Package CR with SSO Templating

By default, UDS generates a secret for the Single Sign-On (SSO) client that encapsulates all client contents as an opaque secret. In this setup, each key within the secret corresponds to its own environment variable or file, based on the method used to mount the secret. If customization of the secret rendering is required, basic templating can be achieved using the `secretTemplate` property. Below are examples showing this functionality. To see how templating works, please see the [Regex website](https://regex101.com/r/e41Dsk/3).

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: grafana
  namespace: grafana
spec:
  sso:
    - name: My Keycloak Client
      clientId: demo-client
      redirectUris:
        - "https://demo.uds.dev/login"
      # Customize the name of the generated secret
      secretName: my-cool-auth-client
      secretTemplate:
        # Raw text examples
        rawTextClientId: "clientField(clientId)"
        rawTextClientSecret: "clientField(secret)"

        # JSON example
        auth.json: |
          {
            "client_id": "clientField(clientId)",
            "client_secret": "clientField(secret)",
            "defaultScopes": clientField(defaultClientScopes).json(),
            "redirect_uri": "clientField(redirectUris)[0]",
            "bearerOnly": clientField(bearerOnly),
          }

        # Properties example
        auth.properties: |
          client-id=clientField(clientId)
          client-secret=clientField(secret)
          default-scopes=clientField(defaultClientScopes)
          redirect-uri=clientField(redirectUris)[0]

        # YAML example (uses JSON for the defaultScopes array)
        auth.yaml: |
          client_id: clientField(clientId)
          client_secret: clientField(secret)
          default_scopes: clientField(defaultClientScopes).json()
          redirect_uri: clientField(redirectUris)[0]
          bearer_only: clientField(bearerOnly)
  ```

### Protecting a UDS Package with Authservice

To enable authentication for applications that do not have native OIDC configuration, UDS Core can utilize Authservice as an authentication layer.

Follow these steps to protect your application with Authservice:

* Set `enableAuthserviceSelector` with a matching label selector in the `sso` configuration of the Package.
* Ensure that the pods of the application are labeled with the corresponding selector

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: httpbin
  namespace: httpbin
spec:
  sso:
    - name: Demo SSO httpbin
      clientId: uds-core-httpbin
      redirectUris:
        - "https://httpbin.uds.dev/login"
      enableAuthserviceSelector:
        app: httpbin
```

:::note
The UDS Operator uses the first `redirectUris` to populate the `match.prefix` hostname and `callback_uri` in the authservice chain.
:::

For a complete example, see [app-authservice-tenant.yaml](https://github.com/defenseunicorns/uds-core/blob/main/src/test/app-authservice-tenant.yaml)

#### Trusted Certificate Authority

Authservice can be configured with additional trusted certificate bundle in cases where UDS Core ingress gateways are deployed with private PKI.

To configure, set [UDS_CA_CERT](https://github.com/defenseunicorns/uds-core/blob/main/packages/standard/zarf.yaml#L11-L13) as an environment variable with a Base64 encoded PEM formatted certificate bundle that can be used to verify the certificates of the tenant gateway.

Alternatively you can specify the `CA_CERT` variable in your `uds-config.yaml`:

```yaml
variables:
  core:
    CA_CERT: <base64 encoded certificate authority>
```

See [configuring Istio Ingress](https://uds.defenseunicorns.com/reference/configuration/ingress/#configure-domain-name-and-tls-for-istio-gateways) for the relevant documentation on configuring ingress certificates.

### Creating a UDS Package with a Device Flow client

Some applications may not have a web UI / server component to login to and may instead grant OAuth tokens to devices.  This flow is known as the [OAuth 2.0 Device Authorization Grant](https://oauth.net/2/device-flow/) and is supported in a UDS Package with the following configuration:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: fulcio
  namespace: fulcio-system
spec:
  sso:
    - name: Sigstore Login
      clientId: sigstore
      standardFlowEnabled: false
      publicClient: true
      attributes:
        oauth2.device.authorization.grant.enabled: "true"
```

This configuration does not create a secret in the cluster and instead tells the UDS Operator to create a public client (one that requires no auth secret) that enables the `oauth2.device.authorization.grant.enabled` flow and disables the standard redirect auth flow.  Because this creates a public client configuration that deviates from this is limited - if your application requires both the Device Authorization Grant and the standard flow this is currently not supported without creating two separate clients.

### Creating a UDS Package with a Service Account Roles client

Some applications may need to access resources / obtain OAuth tokens on behalf of *themselves* vice users. This may be needed to allow API access to Authservice protected applications (outside of a web browser). This is commonly used in machine-to-machine authentication for automated processes. This type of grant in OAuth 2.0 is known as the [Client Credentials Grant](https://oauth.net/2/grant-types/client-credentials/) and is supported in a UDS Package with the following configuration:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: client-cred
  namespace: argo
spec:
  sso:
    - name: httpbin-api-client
      clientId: httpbin-api-client
      standardFlowEnabled: false
      serviceAccountsEnabled: true

      # By default, Keycloak will not set the audience `aud` claim for service account access token JWTs.
      # You can optionally add a protocolMapper to set the audience.
      # If you map the audience to the same client used for authservice, you can enable access to authservice protected apps with a service account JWT.
      protocolMappers:
        - name: audience
          protocol: "openid-connect"
          protocolMapper: "oidc-audience-mapper"
          config:
            included.client.audience: "uds-core-httpbin" # Set this to match the app's authservice client id
            access.token.claim: "true"
            introspection.token.claim: "true"
            id.token.claim: "false"
            lightweight.claim: "false"
            userinfo.token.claim: "false"
```
Setting `serviceAccountsEnabled: true` requires `standardFlowEnabled: false` and is incompatible with `publicClient: true`.

If needed, multiple clients can be added to the same application: an AuthService client, a device flow client, and as many service account clients as required.

A keycloak service account JWT can be distinguished by a username prefix of `service-account-` and a new claim called `client_id`.  Note that the `aud` field is not set by default, hence the mapper in the example.

### SSO Client Attribute Validation

The SSO spec supports a subset of the Keycloak attributes for clients, but does not support all of them. The current supported attributes are:
- oidc.ciba.grant.enabled
- backchannel.logout.session.required
- backchannel.logout.revoke.offline.tokens
- post.logout.redirect.uris
- oauth2.device.authorization.grant.enabled
- pkce.code.challenge.method
- client.session.idle.timeout
- client.session.max.lifespan
- access.token.lifespan
- saml.assertion.signature
- saml.client.signature
- saml_assertion_consumer_url_post
- saml_assertion_consumer_url_redirect
- saml_single_logout_service_url_post
- saml_single_logout_service_url_redirect

## Exemption

- **Exemption Scope:**
  - Granting exemption for custom resources is restricted to the `uds-policy-exemptions` namespace by default, unless specifically configured to allow exemptions across all namespaces.
- **Policy Updates:**
  - Updating the policies Pepr store with registered exemptions.

### Example UDS Exemption CR

```yaml
apiVersion: uds.dev/v1alpha1
kind: Exemption
metadata:
  name: neuvector
  namespace: uds-policy-exemptions
spec:
  exemptions:
    - policies:
        - DisallowHostNamespaces
        - DisallowPrivileged
        - RequireNonRootUser
        - DropAllCapabilities
        - RestrictHostPathWrite
        - RestrictVolumeTypes
      matcher:
        namespace: neuvector
        name: "^neuvector-enforcer-pod.*"

    - policies:
        - DisallowPrivileged
        - RequireNonRootUser
        - DropAllCapabilities
        - RestrictHostPathWrite
        - RestrictVolumeTypes
      matcher:
        namespace: neuvector
        name: "^neuvector-controller-pod.*"

    - policies:
        - DropAllCapabilities
      matcher:
        namespace: neuvector
        name: "^neuvector-prometheus-exporter-pod.*"
```

### Configuring UDS Core Policy Exemptions

Default [policy exemptions](https://github.com/defenseunicorns/uds-core/blob/main/src/pepr/operator/crd/generated/exemption-v1alpha1.ts) are confined to a singular namespace: `uds-policy-exemptions`. We find this to be an optimal approach for UDS due to the following reasons:

- **Emphasis on Security Impact:**
  - An exemption has the potential to diminish the overall security stance of the cluster. By isolating these exemptions within a designated namespace, administrators can readily recognize and assess the security implications associated with each exemption.
- **Simplified RBAC Maintenance:**
  - Adopting this pattern streamlines the management of Role-Based Access Control (RBAC) for overseeing exemptions. Placing all UDS exemptions within a dedicated namespace simplifies the task of configuring and maintaining RBAC policies, enhancing overall control and transparency.
- **Mitigation of Configuration Risks:**
  - By restricting exemptions to a specific namespace, the risk of unintentional misconfigurations in RBAC is significantly reduced. This ensures that cluster exemptions are only granted intentionally and within the confines of the designated namespace, minimizing the potential for security vulnerabilities resulting from misconfigured permissions.

### Allow All Namespaces

If you find that the default scoping is not the right approach for your cluster, you have the option to configure `UDS-CORE` at deploy time to allow exemption CRs in all namespaces:

`zarf package deploy zarf-package-uds-core-*.zst --set ALLOW_ALL_NS_EXEMPTIONS=true`

You can also achieve this through the `uds-config.yaml`:

```yaml
options:
  # options here

shared:
   ALLOW_ALL_NS_EXEMPTIONS: "true"

variables:
 # package specific variables here
```

## Key Files and Folders

```dir
src/pepr/operator/
├── controllers             # Core business logic called by the reconciler
│   ├── exemptions          # Manages updating Pepr store with exemptions from UDS Exemption
│   ├── istio               # Manages Istio VirtualServices and sidecar injection for UDS Packages/Namespace
│   ├── keycloak            # Manages Keycloak client syncing
│   └── network             # Manages default and generated NetworkPolicies for UDS Packages/Namespace
├── crd
│   ├── generated           # Type files generated by `uds run -f src/pepr/tasks.yaml gen-crds`
│   ├── sources             # CRD source files
│   ├── migrate.ts          # Migrates older versions of UDS Package CRs to new version
│   ├── register.ts         # Registers the UDS Package CRD with the Kubernetes API
│   └── validators          # Validates Custom Resources with Pepr
├── index.ts                # Entrypoint for the UDS Operator
└── reconcilers             # Reconciles Custom Resources via the controllers
```
