---
title: Secret Templating
---

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

## Secret Pod Reload

UDS Core provides a Secret Pod Reload mechanism that can restart pods or deployments when secrets are updated. This is useful for SSO client secrets when they need to be updated.

To enable automatic pod reload when a secret changes, add the `uds.dev/pod-reload: "true"` label to your secret.

### Example

Here's an example of a secret configuration with pod reload enabled:

```yaml
apiVersion: uds.dev/v1alpha1
kind: Package
metadata:
  name: my-app
  namespace: my-namespace
spec:
  sso:
    - name: My App
      clientId: my-app-client
      redirectUris:
        - "https://my-app.example.com/callback"
      secretName: my-app-secret
      # To enable pod reload for this secret, add these labels and annotations
      secretLabels:
        uds.dev/pod-reload: "true"
      secretAnnotations:
        uds.dev/pod-reload-selector: 'app=my-app' # Target a specific pod(s) to reload
      secretTemplate:
        config.json: |
          {
            "client_id": "clientField(clientId)",
            "client_secret": "clientField(secret)"
          }
```

When this secret is updated (for example, when rotating the client secret), all pods with the label `app=my-app` will be automatically restarted to pick up the new secret value.
