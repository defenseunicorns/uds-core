# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "keycloak_authentication_flow" "cac_passkey_flow" {
  alias       = "CAC and Passkey"
  description = "browser based authentication"
  provider_id = "basic-flow"
  realm_id    = data.keycloak_realm.uds_realm.id 
}

resource "keycloak_authentication_subflow" "authentication" {
  realm_id          = data.keycloak_realm.uds_realm.id
  alias             = "CAC and passkey"
  parent_flow_alias = keycloak_authentication_flow.cac_passkey_flow.alias
  provider_id       = "basic-flow"
  requirement       = "ALTERNATIVE"

  depends_on = [
    keycloak_authentication_execution.cookie
  ]
}

resource "keycloak_authentication_execution" "cookie" {
  realm_id          = data.keycloak_realm.uds_realm.id
  parent_flow_alias = keycloak_authentication_flow.cac_passkey_flow.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
}

resource "keycloak_authentication_execution" "dod_cac" {
  realm_id     = data.keycloak_realm.uds_realm.id
  authenticator     = "auth-x509-client-username-form"
  parent_flow_alias = keycloak_authentication_subflow.authentication.alias
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "dod_cac_config" {
  realm_id     = data.keycloak_realm.uds_realm.id
  execution_id = keycloak_authentication_execution.dod_cac.id
  alias        = "doc-cac-config"
  config = {
    "x509-cert-auth.canonical-dn-enabled": "false",
    "x509-cert-auth.mapper-selection.user-attribute-name": "usercertificateIdentity",
    "x509-cert-auth.serialnumber-hex-enabled": "false",
    "x509-cert-auth.ocsp-fail-open": "false",
    "x509-cert-auth.regular-expression": "(.*?)(?:$)",
    "x509-cert-auth.certificate-policy-mode": "All",
    "x509-cert-auth.timestamp-validation-enabled": "true",
    "x509-cert-auth.mapper-selection": "Custom Attribute Mapper",
    "x509-cert-auth.crl-relative-path": "crl.pem",
    "x509-cert-auth.crldp-checking-enabled": "false",
    "x509-cert-auth.mapping-source-selection": "Subject's Alternative Name otherName (UPN)",
    "x509-cert-auth.ocsp-checking-enabled": "true"
  }
}

resource "keycloak_authentication_execution" "passkey-second-factor" {
  realm_id     = data.keycloak_realm.uds_realm.id
  authenticator     = "webauthn-authenticator"
  parent_flow_alias = keycloak_authentication_subflow.authentication.alias
  requirement       = "REQUIRED"

  depends_on = [
    keycloak_authentication_execution.dod_cac
  ]
}

resource "keycloak_required_action" "required_action" {
  realm_id = data.keycloak_realm.uds_realm.id
  alias    = "webauthn-register"
  enabled  = true
  name     = "Webauthn Register"
}

resource "keycloak_authentication_bindings" "browser_authentication_binding" {
  realm_id        = data.keycloak_realm.uds_realm.id
  browser_flow  = keycloak_authentication_flow.cac_passkey_flow.alias
}