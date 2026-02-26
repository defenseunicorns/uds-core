---
title: Identity & access
sidebar:
  order: 2
---

## Identity & access in UDS Core

UDS Core centralizes authentication and authorization using Keycloak and Authservice. At a high level:

- Keycloak manages users, groups, and client configuration.
- Authservice enforces SSO at the mesh edge for applications that do not natively support OIDC.
- Group membership and claims drive access to admin and tenant applications.

This page will explain the security and access model, how tenants and admin users are separated, and how identity ties
into mesh and policy behavior.

### Source material from previous docs

Relevant background material from the previous docs includes:

- `src/content/docs-old/reference/configuration/Single Sign-On/overview.md`
- `src/content/docs-old/reference/configuration/Single Sign-On/auth-service.md`
- `src/content/docs-old/reference/configuration/Single Sign-On/group-based-auth.md`
- `src/content/docs-old/reference/configuration/Single Sign-On/keycloak-customization-guide.md`
- `src/content/docs-old/reference/configuration/Single Sign-On/keycloak-session-management.md`
- `src/content/docs-old/reference/configuration/Single Sign-On/service-account.md`
