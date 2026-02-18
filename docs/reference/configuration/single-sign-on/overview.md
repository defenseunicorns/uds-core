---
title: Overview
sidebar:
  order: 3
---

UDS Core leverages [Keycloak](https://www.keycloak.org/) and [Authservice](https://github.com/istio-ecosystem/authservice) to implify authentication and authorization for applications. These tools enable seamless user authentication experiences while supporting various OAuth 2.0 and OpenID Connect (OIDC) flows.

UDS Core automates Keycloak Client configuration, secret management, and advanced templating, offering scalable support for a wide range of applications and authentication scenarios. The chart below illustrates the basic logical connection between these concepts:

![Single Sign-On Flow Chart](https://github.com/defenseunicorns/uds-core/blob/main/docs/.images/diagrams/uds-core-operator-authservice-keycloak.svg?raw=true)

When a new UDS Package CR with the `sso` configuration gets deployed, the UDS Operator creates a new Keycloak Client. This process happens using the [Keycloak Admin endpoint](https://www.keycloak.org/docs-api/latest/rest-api/index.html#_clients) for managing Clients. The latter mode reads the Client Secrets from the `keycloak-client-secrets` Kubernetes Secret deployed in `keycloak` namespace. This Secret is managed automatically by the UDS Operator. Once the Keycloak Client is ready, and the `enableAuthserviceSelector` is defined in the spec, the UDS Operator deploys Istio [Request Authentication](https://istio.io/latest/docs/reference/config/security/request_authentication/) and [AuthorizationPolicy](https://istio.io/latest/docs/reference/config/security/authorization-policy/) for both JWT and Request Headers. Both actions combined, enables seamless and transparent application authentication and authorization capabilities.

:::note
Keycloak provides comprehensive monitoring through Grafana dashboards. For more information, see the [Keycloak Observability Documentation](https://www.keycloak.org/observability/grafana-dashboards).

Key dashboards included:

- **Keycloak Capacity Planning Dashboard**
  - Focuses on authentication request metrics and events
  - Tracks authentication success/failure rates
  - Monitors token issuance and validation metrics
  - Helps with understanding authentication workload patterns

- **Keycloak Troubleshooting Dashboard**
  - Comprehensive cluster health monitoring
  - Tracks JVM metrics (memory, GC, threads)
  - Monitors database connection pool and performance
  - Provides system resource utilization metrics
  - Helps identify and diagnose cluster-wide issues
:::

## Rotating the UDS Operator Client Secret

The UDS Operator uses a dedicated Client in Keycloak. In some cases, the Client Secret needs to be rotated. In order to do so, you need to manually modify the `keycloak-client-secrets` Kubernetes Secret in the `keycloak` namespace and delete the `uds-operator` key. The UDS Operator will automatically re-create it.

## Secret Pod Reload for SSO Clients

When SSO client secrets are updated or rotated, applications using these secrets may need to be restarted to pick up the new values. UDS Core provides a Secret Pod Reload mechanism that detects changes to secrets and restarts the relevant pods or deployments.

To enable this functionality for SSO client secrets, you can add the `uds.dev/pod-reload: "true"` label to the secret via the `secretConfig.labels` field in your Package CR. When a secret with this label is updated, UDS Core will either:

1. Restart pods matching the selector specified in the `uds.dev/pod-reload-selector` annotation (which can be added via the `secretConfig.annotations` field), or
2. Automatically discover and restart pods that are consuming the secret through volume mounts, environment variables, or projected volumes

For more details on configuring Secret Pod Reload, see the [Secret Pod Reload documentation](/reference/deployment/pod-reload) or the [Secret Templating documentation](/reference/configuration/single-sign-on/sso-templating#secret-pod-reload).

## User Groups

UDS Core deploys Keycloak which has some preconfigured groups that applications inherit from SSO and IDP configurations. More details might be found in the [Package CR](/reference/configuration/custom-resources/packages-v1alpha1-cr/#groups) spec.

### Applications

#### Grafana

Grafana [maps the groups](https://github.com/defenseunicorns/uds-core/blob/49cb11a058a9209cee7019fa552b8c0b2ef73368/src/grafana/values/values.yaml#L37) from Keycloak to its internal `Admin` and `Viewer` groups.

| Keycloak Group | Mapped Grafana Group |
|----------------|----------------------|
| `Admin`        | `Admin`              |
| `Auditor`      | `Viewer`             |

If a user doesn't belong to either of these Keycloak groups the user will be unauthorized when accessing Grafana.

##### Overriding Grafana Groups

To override the Keycloak -> Grafana group mapping you can provide the following bundle overrides:

```yaml
grafana:
  uds-grafana-config:
    values:
      # Allows access to Keycloak Client
      - path: sso.groups
        value:
          - KEYCLOAK_ADMIN_GROUP # name of an existing Keycloak group
          - KEYCLOAK_AUDITOR_GROUP # name of an existing Keycloak group
  grafana:
    values:
      # Sets the role mappings in grafana
      - path: grafana\.ini.auth\.generic_oauth.role_attribute_path
        value: "contains(groups[], 'KEYCLOAK_ADMIN_GROUP') && 'Admin' || contains(groups[], 'KEYCLOAK_AUDITOR_GROUP') && 'Viewer' || 'Unauthorized'"

```

#### Keycloak

All groups are under the `UDS Core` parent group. Frequently a group will be referred to as `UDS Core/Admin` or `UDS Core/Auditor`. In the Keycloak UI this requires an additional click to get down to the sub groups.

## Single Sign-On Contents

1. [Customizing Identity Config Guide](/reference/configuration/single-sign-on/keycloak-customization-guide/)
1. [Authservice Protection](/reference/configuration/single-sign-on/auth-service/)
1. [Device Flow Clients](/reference/configuration/single-sign-on/device-flow/)
1. [Group Based Authorization](/reference/configuration/single-sign-on/group-based-auth/)
1. [Keycloak Session Management](/reference/configuration/single-sign-on/keycloak-session-management/)
1. [L7 Load Balancer](/reference/configuration/single-sign-on/l7-load-balancer/)
1. [Notifications and Alerts](/reference/configuration/single-sign-on/notifications-and-alerts/)
1. [Recovering lost Keycloak credentials](/reference/configuration/single-sign-on/recovering-lost-credentials/)
1. [Service Account Roles Clients](/reference/configuration/single-sign-on/service-account/)
1. [Client Attribute Validation](/reference/configuration/single-sign-on/sso-client-validation/)
1. [Secret Templating](/reference/configuration/single-sign-on/sso-templating/)
1. [Trusted Certificate Authority](/reference/configuration/single-sign-on/trusted-ca/)
