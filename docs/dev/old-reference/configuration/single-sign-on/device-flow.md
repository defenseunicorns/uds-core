---
title: Device Flow Clients
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
