---
title: UDS Package
sidebar:
    order: 2
---

![UDS Operator Package Flowchart](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/uds-core-operator-uds-package.svg?raw=true)

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
        remoteNamespace: monitoring
        remoteSelector:
          app.kubernetes.io/name: alertmanager
        port: 9093
        description: "Alertmanager Datasource"

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

This example may not contain all fields, the full specification for the Package CR is documented [here](/reference/configuration/custom-resources/packages-v1alpha1-cr). In addition, there is a JSON schema published [here](https://raw.githubusercontent.com/defenseunicorns/uds-core/refs/heads/main/schemas/package-v1alpha1.schema.json) for use in your IDE.

:::note
More SSO Package examples might be found [here](/reference/configuration/single-sign-on/overview/).
:::