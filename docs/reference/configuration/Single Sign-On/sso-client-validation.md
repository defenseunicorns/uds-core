---
title: SSO Client Attribute Validation
---

The SSO spec supports a subset of the Keycloak attributes for clients, but does not support all of them. The current supported attributes are:
- oidc.ciba.grant.enabled
- backchannel.logout.session.required
- backchannel.logout.revoke.offline.tokens
- post.logout.redirect.uris
- oauth2.device.authorization.grant.enabled
- pkce.code.challenge.method
- client.session.idle.timeout
- client.session.max.lifespan
- access.token.lifespan
- saml.assertion.signature
- saml.client.signature
- saml_assertion_consumer_url_post
- saml_assertion_consumer_url_redirect
- saml_single_logout_service_url_post
- saml_single_logout_service_url_redirect
