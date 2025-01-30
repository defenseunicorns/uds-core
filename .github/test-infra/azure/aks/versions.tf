# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

terraform {
  backend "azurerm" {
  }
}

provider "azurerm" {
  features {
  }
}

provider "kubernetes" {
  host = azurerm_kubernetes_cluster.aks_cluster.kube_admin_config[0].host
  username               = azurerm_kubernetes_cluster.aks_cluster.kube_config[0].username
  password               = azurerm_kubernetes_cluster.aks_cluster .kube_config[0].password
  client_certificate = base64decode(azurerm_kubernetes_cluster.aks_cluster.kube_admin_config[0].client_certificate)
  client_key = base64decode(azurerm_kubernetes_cluster.aks_cluster.kube_admin_config[0].client_key)
  cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.aks_cluster.kube_admin_config[0].cluster_ca_certificate)
}