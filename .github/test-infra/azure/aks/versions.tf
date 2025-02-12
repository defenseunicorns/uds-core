# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

terraform {
  backend "azurerm" {
  }
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "2.2.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "4.18.0"
    }
  }
}

provider "azurerm" {
  features {
  }
}
