---
title: Overview
sidebar:
  order: 20
---

UDS Core leverages [Keycloak](https://www.keycloak.org/) and [Authservice](https://github.com/istio-ecosystem/authservice) to implify authentication and authorization for applications. These tools enable seamless user authentication experiences while supporting various OAuth 2.0 and OpenID Connect (OIDC) flows.

UDS Core automates Keycloak Client configuration, secret management, and advanced templating, offering scalable support for a wide range of applications and authentication scenarios. The chart below illustrates the basic logical connection between these concepts:

![UDS Operator Exemption Flowchart](https://github.com/defenseunicorns/uds-core/blob/1282-SSO_docs_refactoring/docs/.images/diagrams/uds-core-operator-authservice-keycloak.svg?raw=true)

When a new UDS Package CR with the `sso` configuration gets deployed, the UDS Operator creates a new Keycloak Client using the [Dynamic Client Registration](https://www.keycloak.org/securing-apps/client-registration). The Registration Token that is used for updating and removing the newly created Keycloak Client is stored in Pepr Store. Once the Keycloak Client is ready, the UDS Operator deploys Istio [Request Authentication](https://istio.io/latest/docs/reference/config/security/request_authentication/) and [AuthorizationPolicy](https://istio.io/latest/docs/reference/config/security/authorization-policy/) for both JWT and Request Headers. Both actions combined enable seamless and transparent application authentication and authorization capabilities. 

## User Groups

UDS Core deploys Keycloak which has some preconfigured groups that applications inherit from SSO and IDP configurations.

### Applications

#### Grafana

Grafana [maps the groups](https://github.com/defenseunicorns/uds-core/blob/49cb11a058a9209cee7019fa552b8c0b2ef73368/src/grafana/values/values.yaml#L37) from Keycloak to it's internal `Admin` and `Viewer` groups.

| Keycloak Group | Mapped Grafana Group |
|----------------|----------------------|
| `Admin`        | `Admin`              |
| `Auditor`      | `Viewer`             |

If a user doesn't belong to either of these Keycloak groups the user will be unauthorized when accessing Grafana.

#### Neuvector

Neuvector [maps the groups](https://github.com/defenseunicorns/uds-core/blob/main/src/neuvector/chart/templates/uds-package.yaml#L31-L35) from Keycloak to it's internal `admin` and `reader` groups.

| Keycloak Group | Mapped Neuvector Group |
|----------------|------------------------|
| `Admin`        | `admin`                |
| `Auditor`      | `reader`               |

#### Keycloak

:::note
All groups are under the Uds Core parent group. Frequently a group will be referred to as Uds Core/Admin or Uds Core/Auditor. In the Keycloak UI this requires an additional click to get down to the sub groups.
:::


## Single Sign-On Contents

1. [Authservice Protection](/reference/configuration/single-sign-on/auth-service/)
2. [Device Flow Clients](/reference/configuration/single-sign-on/device-flow/)
3. [Group Based Authorization](/reference/configuration/single-sign-on/group-based-auth/)
4. [Service Account Roles Clients](/reference/configuration/single-sign-on/service-account/)
5. [Client Attribute Validation](/reference/configuration/single-sign-on/sso-client-validation/)
6. [Secret Templating](/reference/configuration/single-sign-on/sso-templating/)
7. [Trusted Certificate Authority](/reference/configuration/single-sign-on/trusted-ca/)