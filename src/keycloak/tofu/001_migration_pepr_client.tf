data "keycloak_realm" "uds" {
  realm             = "uds"
}

data "keycloak_openid_client" "realm_management_client" {
    realm_id = data.keycloak_realm.uds.id
    client_id = "realm-management"
}

resource "keycloak_openid_client" "pepr_client" {
  client_id   = "pepr"
  name        = "pepr"
  realm_id    = data.keycloak_realm.uds.id
  description = "UDS Operator Client management"
  client_secret = "pepr"
  access_type = "CONFIDENTIAL"
  service_accounts_enabled = true
}

resource "keycloak_openid_client_service_account_role" "pepr_service_account_role_assignment" {
    realm_id                = data.keycloak_realm.uds.id
    service_account_user_id = keycloak_openid_client.pepr_client.service_account_user_id
    client_id               = data.keycloak_openid_client.realm_management_client.id // ID of the client the role belongs to, not ID of client assigning to.
    role                    = "manage-clients"
}
