terraform {
  required_providers {
    keycloak = {
      source = "keycloak/keycloak"
      version = ">= 5.1.0"
    }
  }
}

provider "keycloak" {
#   client_id     = "terraform"
#   client_secret = "884e0f95-0f42-4a63-9b1f-94274655669e"
#   url           = "http://localhost:8080"
#   additional_headers = {
#     foo = "bar"
#   }
    client_id     = "admin-cli"
    username      = "admin"
    password      = "admin"
    url           = "https://keycloak.admin.uds.dev"
}

data "keycloak_realm" "master" {
  realm             = "master"
}


resource "keycloak_user" "user" {
  realm_id = data.keycloak_realm.master.id
  username = "test-user"

  email      = "test-user@fakedomain.com"
  first_name = "Testy"
  last_name  = "Tester"
}
