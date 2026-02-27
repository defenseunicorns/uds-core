---
title: Identity & Access
sidebar:
  order: 4
---

## Identity & access reference

This is one of the main places where UDS Core needs detailed, Core-specific technical reference.

Include here:

- Keycloak and Authservice configuration options used by UDS Core.
- Supported identity provider integration details at a reference level (what is supported, which fields matter).
- Stable behavior notes: sessions, group mapping, claims, templates, and defaults.

Task-focused guides ("connect Azure AD", "recover credentials", "rotate certificates") should be in **How-to Guides → Identity & access**, with this section linked for exact settings and behavior.

### Source material from previous docs

- `src/content/docs-old/reference/configuration/Single Sign-On/overview.md` *(mixed; use only the descriptive/behavior sections here, move rotation/pod-reload examples to How-to/Ops)*
- `src/content/docs-old/reference/configuration/Single Sign-On/auth-service.md` *(mixed; reference for fields and validation rules, step-by-step protection flows belong in How-to)*
- `src/content/docs-old/reference/configuration/Single Sign-On/group-based-auth.md` *(mixed; table and field semantics belong here, examples go to How-to)*
- `src/content/docs-old/reference/configuration/Single Sign-On/keycloak-session-management.md`
- `src/content/docs-old/reference/configuration/Single Sign-On/sso-templating.md` *(reference for templating fields; workflow content to How-to)*
- `src/content/docs-old/reference/configuration/Single Sign-On/trusted-ca.md`
