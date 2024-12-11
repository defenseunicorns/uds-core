# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

terraform {
  required_providers {
    keycloak = {
      source = "keycloak/keycloak"
      version = "4.5.0"
    }
  }
}
