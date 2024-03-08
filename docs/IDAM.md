## Keycloak Package

For details on the Keycloak Package see [README.md](../src/keycloak/README.md)

## Configure Keycloak client for UDS Package

This section provides instructions on how to automatically create a Keycloak client for your UDS package.

If your application can be configured with an OIDC `clientId` and `clientSecret`, this is the preferred method for creating a Keycloak client. 

* A secret, named `sso-client-<clientId>`, will be automatically generated. This secret holds the client representation. If desired, you can provide a custom `secretName` to be used instead.

* The required fields for creating a Keycloak client are `name`,`clientId`, and `redirectUris`. Make sure to provide these details accurately to ensure the correct setup of your Keycloak client. 

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
```

## AuthService Package

For details on the AuthService Package see [README.md](../src/authservice/README.md)

## Protecting a UDS Package with AuthService
To enable authentication for applications that do not have native OIDC configuration, UDS Core can utilize AuthService as an authentication layer.

Follow these steps to protect your application with AuthService:

* Set the `isAuthSvcClient` field to `true` in the `sso` configuration of the Package.
* Ensure that the pods of the application are labeled with: `protect: keycloak`.

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
      isAuthSvcClient: true
```
For a complete example, see [app-authservice-tenant.yaml](../src/test/app-authservice-tenant.yaml)


## Developing with Keycloak and Authservice

To create a dev k3d cluster with Keycloak and Authservice deployed, run:

```bash
uds run dev-identity
```

To deploy an UDS Package that leverages both AuthService and a UDS Core managed Keycloak client run:

```bash
kubectl apply -f src/test/app-authservice-tenant.yaml
```

To verify authentication is working navigate to [https://protected.uds.dev](https://protected.uds.dev/).

> [!NOTE]
> If you are intending to make changes to the Pepr module and want to debug, you must redeploy Pepr with `npx pepr dev`
>

### Creating a User
In a development environment, it is necessary to register a new account for testing purposes. The registration process can be completed as an end user, except for the email verification step due to a lack of mail server in development environments. To bypass the email verification, you can access the admin account using the method documented below and manually indicate that the email has been verified for your test user.

### Admin Access
To be able to initially access the Keycloak admin account you must create the initial admin user by using zarf connect

```bash
zarf connect keycloak
```
