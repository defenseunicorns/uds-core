---
title: Client Attribute Validation
---

The `sso.attributes` part of the [UDS Package CR](/reference/configuration/custom-resources/packages-v1alpha1-cr/#sso) supports a subset of the Keycloak attributes for clients (but not support all of them). The currently supported attributes are:

- access.token.lifespan
- backchannel.logout.revoke.offline.tokens
- backchannel.logout.session.required
- client.session.idle.timeout
- client.session.max.lifespan
- logout.confirmation.enabled
- oauth2.device.authorization.grant.enabled
- oidc.ciba.grant.enabled
- pkce.code.challenge.method
- post.logout.redirect.uris
- saml.assertion.signature
- saml.client.signature
- saml.encrypt
- saml.signing.certificate
- saml_assertion_consumer_url_post
- saml_assertion_consumer_url_redirect
- saml_idp_initiated_sso_url_name
- saml_name_id_format
- saml_single_logout_service_url_post
- saml_single_logout_service_url_redirect
- use.refresh.tokens
