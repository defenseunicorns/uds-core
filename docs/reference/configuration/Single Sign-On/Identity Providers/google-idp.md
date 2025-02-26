---
title: Google IdP
---

UDS Core ships with a templated Google SAML IDP in our [realm.json](https://github.com/defenseunicorns/uds-identity-config/blob/main/src/realm.json):

```yaml
    "identityProviders": [
        {
          "alias": "saml",
          "displayName": "Google SSO",
          "internalId": "123",
          "providerId": "saml",
          "enabled": "${REALM_GOOGLE_IDP_ENABLED:false}",
          "updateProfileFirstLoginMode": "on",
          "trustEmail": true,
          "storeToken": false,
          "addReadTokenRoleOnCreate": false,
          "authenticateByDefault": false,
          "linkOnly": false,
          "postBrokerLoginFlowAlias": "Group Protection Authorization",
          "config": {
            "postBindingLogout": "false",
            "postBindingResponse": "true",
            "backchannelSupported": "false",
            "idpEntityId": "https://accounts.google.com/o/saml2?idpid=${REALM_GOOGLE_IDP_ID}",
            "loginHint": "false",
            "allowCreate": "true",
            "enabledFromMetadata": "true",
            "singleSignOnServiceUrl": "https://accounts.google.com/o/saml2/idp?idpid=${REALM_GOOGLE_IDP_ID}",
            "wantAuthnRequestsSigned": "false",
            "allowedClockSkew": "0",
            "validateSignature": "true",
            "signingCertificate": "${REALM_GOOGLE_IDP_SIGNING_CERT}",
            "nameIDPolicyFormat": "${REALM_GOOGLE_IDP_NAME_ID_FORMAT}",
            "entityId": "${REALM_GOOGLE_IDP_CORE_ENTITY_ID}",
            "signSpMetadata": "false",
            "wantAssertionsEncrypted": "false",
            "sendClientIdOnLogout": "false",
            "wantAssertionsSigned": "false",
            "sendIdTokenOnLogout": "true",
            "postBindingAuthnRequest": "true",
            "forceAuthn": "false",
            "attributeConsumingServiceIndex": "0",
            "addExtensionsElementWithKeyInfo": "false",
            "principalType": "Subject NameID",
            "syncMode": "FORCE"
          }
        }
      ],
```

In addition to the custom realm.json for the Google IDP, there is also custom `identityProviderMappers`:
```yaml
      "identityProviderMappers": [
        {
          "id": "24c62f1a-9da4-4758-bc97-3310e04ea73b",
          "name": "Email Mapper",
          "identityProviderAlias": "saml",
          "identityProviderMapper": "saml-user-attribute-idp-mapper",
          "config": {
            "syncMode": "INHERIT",
            "user.attribute": "email",
            "attribute.friendly.name": "email",
            "attribute.name.format": "ATTRIBUTE_FORMAT_BASIC",
            "attribute.name": "email"
          }
        },
        {
          "id": "ae4f9a94-5e70-4eb2-be9f-752b7401f98e",
          "name": "Admin Group Mapper",
          "identityProviderAlias": "saml",
          "identityProviderMapper": "saml-advanced-group-idp-mapper",
          "config": {
            "syncMode": "INHERIT",
            "attributes": "[{\"key\":\"groups\",\"value\":\"${REALM_GOOGLE_IDP_ADMIN_GROUP}\"}]",
            "group": "/UDS Core/Admin"
          }
        },
        {
          "id": "ea435551-17dc-4096-8a26-e4585b48dbfa",
          "name": "Auditor Group Mapper",
          "identityProviderAlias": "saml",
          "identityProviderMapper": "saml-advanced-group-idp-mapper",
          "config": {
            "syncMode": "INHERIT",
            "attributes": "[{\"key\":\"groups\",\"value\":\"${REALM_GOOGLE_IDP_AUDITOR_GROUP}\"}]",
            "group": "/UDS Core/Auditor"
          }
        },
        {
          "id": "9492c99f-6d42-4127-9b29-4230b69f17b0",
          "name": "firstName Mapper",
          "identityProviderAlias": "saml",
          "identityProviderMapper": "saml-user-attribute-idp-mapper",
          "config": {
            "syncMode": "INHERIT",
            "user.attribute": "firstName",
            "attribute.name.format": "ATTRIBUTE_FORMAT_BASIC",
            "attribute.name": "firstName"
          }
        },
        {
          "id": "affcb9cd-e27d-459f-8d69-c2b16ba5e5f7",
          "name": "lastName Mapper",
          "identityProviderAlias": "saml",
          "identityProviderMapper": "saml-user-attribute-idp-mapper",
          "config": {
            "syncMode": "INHERIT",
            "user.attribute": "lastName",
            "attribute.name.format": "ATTRIBUTE_FORMAT_BASIC",
            "attribute.name": "lastName"
          }
        }
      ],
```

Documentation to configure the `realmInitEnv` values in [uds-identity-config](https://uds.defenseunicorns.com/reference/uds-core/idam/customization/#customizing-realm).

Alternatively, the `realmInitEnv` can be configured via bundle overrides like in the UDS Core [k3d-standard-bundle](https://github.com/defenseunicorns/uds-core/blob/main/bundles/k3d-standard/uds-bundle.yaml):
```yaml
          values:
            - path: realmInitEnv
              value:
                GOOGLE_IDP_ENABLED: true
                GOOGLE_IDP_ID: "123"
                GOOGLE_IDP_SIGNING_CERT: "MIID..."
                GOOGLE_IDP_NAME_ID_FORMAT: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"
                GOOGLE_IDP_CORE_ENTITY_ID: "https://sso.uds.dev/realms/uds"
                GOOGLE_IDP_ADMIN_GROUP: "uds-core-dev-admin"
                GOOGLE_IDP_AUDITOR_GROUP: "uds-core-dev-auditor"
```

Configuring your own IDP can be achieved via:

* Custom uds-identity-config with a templated realm.json
* Keycloak Admin UI and click ops
* Custom realm.json for direct import in Keycloak

## References
- [Google Cloud's Keycloak integration documentation](https://cloud.google.com/architecture/identity/keycloak-single-sign-on)
