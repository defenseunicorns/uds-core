---
title: Service Account Roles Clients
---

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

In some rare cases, there's a need to use an array of audiences in the JWT token. This approach enables logical application grouping but also introduces additional risk by extending the trust boundaries. The example below illustrates how to configure the UDS Package for such a scenario:

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
      defaultClientScopes:
        - openid
      protocolMappers:
        - name: audience-uds-core-app-1
          protocol: "openid-connect"
          protocolMapper: "oidc-audience-mapper"
          config:
            included.custom.audience: "uds-core-app-1"
            access.token.claim: "true"
            introspection.token.claim: "true"
            id.token.claim: "true"
            lightweight.claim: "true"
            userinfo.token.claim: "true"
        - name: audience-uds-core-app-2
          protocol: "openid-connect"
          protocolMapper: "oidc-audience-mapper"
          config:
            included.custom.audience: "uds-core-app-2"
            access.token.claim: "true"
            introspection.token.claim: "true"
            id.token.claim: "true"
            lightweight.claim: "true"
            userinfo.token.claim: "true"
```
