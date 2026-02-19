# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "azurerm_virtual_network" "cluster-vnet" {
  name                = "${local.cluster_name}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = var.tags
}

resource "azurerm_subnet" "cluster_node_subnet" {
  name                 = "${local.cluster_name}-system-node-subnet"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.cluster-vnet.name
  address_prefixes     = ["10.0.0.0/20"]
}

resource "azurerm_subnet" "cluster_worker_node_subnet" {
  name                 = "${local.cluster_name}-worker-node-subnet"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.cluster-vnet.name
  address_prefixes     = ["10.0.16.0/20"]
}

# https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking-private
resource "azurerm_subnet" "postgres_subnet" {
  name                 = "${local.cluster_name}-postgres-subnet"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.cluster-vnet.name
  address_prefixes     = ["10.0.32.0/20"]
  service_endpoints = [
    "Microsoft.Storage",
  ]
  delegation {
    name = "fs"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

resource "azurerm_subnet" "cluster_api_subnet" {
  name                 = "${local.cluster_name}-api-subnet"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.cluster-vnet.name
  address_prefixes     = ["10.0.48.0/24"]
  delegation {
    name = "api"
    service_delegation {
      name = "Microsoft.ContainerService/managedClusters"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

resource "azurerm_private_dns_zone" "cluster_dns_zone" {
  name                = "${local.cluster_name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "cluster_dns_zone_link" {
  name                  = "${local.cluster_name}-dns"
  private_dns_zone_name = azurerm_private_dns_zone.cluster_dns_zone.name
  virtual_network_id    = azurerm_virtual_network.cluster-vnet.id
  resource_group_name   = azurerm_resource_group.this.name
  depends_on            = [azurerm_subnet.postgres_subnet]
}
