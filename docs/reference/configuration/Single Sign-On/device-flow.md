---
title: Creating a UDS Package with a Device Flow client
---

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
