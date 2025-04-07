---
title: UDS Package
---

![UDS Operator Package Flowchart](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/uds-core-operator-uds-package.svg?raw=true)

## Package
:::note
Only one UDS Package Custom Resource can exist in a namespace. This pattern was chosen by design to better enable workload isolation and to reduce complexity.
:::
Namespaces are a common boundary for isolating workloads in multi-tenant clusters. When defining a UDS Package resource, consider the implications for all workloads that exist in the target namespace. If the UDS Package that you are defining has configurations that conflict with each other or would be simplified by using a separate UDS Package definition, consider using a separate Kubernetes namespace. Read more about namespaces and mulitenancy [here](https://kubernetes.io/docs/concepts/security/multi-tenancy/).

The UDS Operator seamlessly enables the following enhancements and protections for your workloads:
- **Enabling Istio Sidecar Injection:**
  - The operator facilitates the activation of Istio sidecar injection within namespaces where the CR is deployed.
- **Support for Istio Ambient Mode:**
  - Packages can now opt into Istio's Ambient mode by setting `spec.network.serviceMesh.mode: ambient`. This provides service mesh capabilities and security without sidecars, reducing resource overhead.
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
Warning: **Istio Ambient Mode** Package support is in Alpha and may not be stable. Different workloads may experience issues when migrating away from sidecars so testing in a development/staging environment is encouraged. In addition there are some known limitations with ambient support at this time:
- `Package` CRs with AuthService SSO clients (`enableAuthserviceSelector`) are not supported in ambient mode. This is a limitation we plan to remove with operator support/configuration of [waypoint proxies](https://istio.io/latest/docs/ambient/usage/waypoint/), track progress on [this issue in GitHub](https://github.com/defenseunicorns/uds-core/issues/1200).
- Metrics of applications in ambient mode will _NOT_ be scraped successfully by Prometheus when STRICT mTLS is being enforced (there may be workarounds to scrape in PERMISSIVE mode but this is not advised). This will be resolved once Prometheus is migrated to ambient mode.
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
