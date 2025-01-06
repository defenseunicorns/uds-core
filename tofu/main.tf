# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# provider "keycloak" {
#   client_id     = "tofu-provider"
#   client_secret = "XRqav459WyC2qp7ShxbR1Nxu52cSPG8J"
#   url           = "https://keycloak.admin.uds.dev"
# }

provider "keycloak" {
  client_id     = "admin-cli"
  username      = "admin"
  password      = "admin"
  url           = "https://keycloak.admin.uds.dev"
}

data "keycloak_realm" "uds_realm" {
  realm = "uds"
}

resource "keycloak_saml_identity_provider" "realm_azure_saml_identity_provider" {
  realm = data.keycloak_realm.uds_realm.id 
  alias = "saml-rob"

  entity_id                  = "api://f6a5ba37-b4a1-4667-8e3d-3eae7d20bba3"
  single_sign_on_service_url = "https://login.microsoftonline.com/23af9035-bc23-41bb-bbf6-8556e70ff36a/saml2"
  single_logout_service_url  = "https://login.microsoftonline.com/23af9035-bc23-41bb-bbf6-8556e70ff36a/saml2"
  post_broker_login_flow_alias = "Group Protection Authorization"

  backchannel_supported      = true
  post_binding_response      = true
  post_binding_logout        = true
  post_binding_authn_request = true
  store_token                = false
  trust_email                = true
  force_authn                = true
  validate_signature         = true
  signature_algorithm        = "RSA_SHA256"

  sync_mode = "FORCE"

  extra_config = {
    metadataDescriptorUrl = "https://login.microsoftonline.com/23af9035-bc23-41bb-bbf6-8556e70ff36a/federationmetadata/2007-06/federationmetadata.xml"
    useMetadataDescriptorUrl = true
    idpEntityId = "https://sts.windows.net/23af9035-bc23-41bb-bbf6-8556e70ff36a/"
  }
}

resource "keycloak_attribute_importer_identity_provider_mapper" "username" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "username-attribute-importer"
  claim_name              = "username"
  attribute_name          = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  user_attribute          = "username"
}

resource "keycloak_attribute_importer_identity_provider_mapper" "name" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "email-attribute-importer"
  claim_name              = "email"
  attribute_name          = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  user_attribute          = "email"
}

resource "keycloak_attribute_importer_identity_provider_mapper" "lastname" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "lastname-attribute-importer"
  claim_name              = "lastname"
  attribute_name          = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  user_attribute          = "lastname"
}

resource "keycloak_attribute_importer_identity_provider_mapper" "firstname" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "firstname-attribute-importer"
  claim_name              = "firstname"
  attribute_name          = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  user_attribute          = "firstname"
}

resource "keycloak_attribute_importer_identity_provider_mapper" "authnmethodsreferences" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "authnmethodsreferences-attribute-importer"
  claim_name              = "authnmethodsreferences"
  attribute_name          = "http://schemas.microsoft.com/claims/authnmethodsreferences"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  user_attribute          = "authnmethodsreferences"
}

# Group Mapping For UDS Core
resource "keycloak_custom_identity_provider_mapper" "admin" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "admin-group-attribute-importer"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  identity_provider_mapper = "saml-advanced-group-idp-mapper"

  extra_config = {
    "syncMode" = "FORCE"
    "attributes" = "[{\"key\":\"http://schemas.microsoft.com/ws/2008/06/identity/claims/groups\",\"value\":\"34b4a37e-1ad4-442a-b2d1-2a633736d624\"}]"
    "are.attribute.values.regex" = "false"
    "group" = "/UDS Core/Admin"
  }
}

resource "keycloak_custom_identity_provider_mapper" "auditor" {
  realm                   = data.keycloak_realm.uds_realm.id
  name                    = "auditor-group-attribute-importer"
  identity_provider_alias = keycloak_saml_identity_provider.realm_azure_saml_identity_provider.alias
  identity_provider_mapper = "saml-advanced-group-idp-mapper"

  extra_config = {
    "syncMode" = "FORCE"
    "attributes" = "[{\"key\":\"http://schemas.microsoft.com/ws/2008/06/identity/claims/groups\",\"value\":\"cb447ba0-3b2c-42e5-a347-65183b08b525\"}]"
    "are.attribute.values.regex" = "false"
    "group" = "/UDS Core/Auditor"
  }
}
