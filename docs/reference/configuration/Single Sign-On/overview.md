---
title: Overview
sidebar:
    order: 100
---

UDS Core leverages [Keycloak](https://www.keycloak.org/) and [Authservice](https://github.com/istio-ecosystem/authservice) to implify authentication and authorization for applications. These tools enable seamless user authentication experiences while supporting various OAuth 2.0 and OpenID Connect (OIDC) flows.

UDS Core automates Keycloak Client configuration, secret management, and advanced templating, offering scalable support for a wide range of applications and authentication scenarios. The chart below illustrates the basic logical connection between these concepts:

![UDS Operator Exemption Flowchart](https://github.com/defenseunicorns/uds-core/blob/1282-SSO_docs_refactoring/docs/.images/diagrams/uds-core-operator-authservice-keycloak.svg?raw=true)

When a new UDS Package CR with the `sso` configuration gets deployed, the UDS Operator creates a new Keycloak Client using the [Dynamic Client Registration](https://www.keycloak.org/securing-apps/client-registration). The Registration Token that is used for updating and removing the newly created Keycloak Client is stored in Pepr Store. Once the Keycloak Client is ready, the UDS Operator deploys Istio [Request Authentication](https://istio.io/latest/docs/reference/config/security/request_authentication/) and [AuthorizationPolicy](https://istio.io/latest/docs/reference/config/security/authorization-policy/) for both JWT and Request Headers. Both actions combined enable seamless and transparent application authentication and authorization capabilities. 
