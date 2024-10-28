# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "azurerm_storage_account" "cluster_storage" {
  name                            = substr("sa${replace(local.cluster_name, "-", "")}", 0, 24)
  resource_group_name             = azurerm_resource_group.this.name
  location                        = azurerm_resource_group.this.location
  allow_nested_items_to_be_public = false
  account_tier                    = "Standard"
  account_replication_type        = "GRS"

  tags = var.tags
}


# Create the container for Velero
resource "azurerm_storage_container" "velero_container" {
  name                  = "velero"
  storage_account_name  = azurerm_storage_account.cluster_storage.name
  container_access_type = "private"
}

# Create the container for loki
resource "azurerm_storage_container" "loki_container" {
  name                  = "loki"
  storage_account_name  = azurerm_storage_account.cluster_storage.name
  container_access_type = "private"
}

resource "random_password" "db_password" {
  length  = 16
  special = false
}

resource "azurerm_postgresql_flexible_server" "grafana_psql_server" {
  name                          = "${local.cluster_name}-grafana-psqlserver"
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  version                       = "16"
  delegated_subnet_id           = azurerm_subnet.postgres_subnet.id
  public_network_access_enabled = false
  administrator_login           = var.username
  administrator_password        = random_password.db_password.result

  private_dns_zone_id = azurerm_private_dns_zone.cluster_dns_zone.id
  storage_mb          = 32768
  storage_tier        = "P30"

  sku_name = "GP_Standard_D4s_v3"
  lifecycle {
    ignore_changes = [zone]
  }

}

resource "azurerm_postgresql_flexible_server_database" "grafana_psql_db" {
  name      = var.db_name
  server_id = azurerm_postgresql_flexible_server.grafana_psql_server.id
  collation = "en_US.utf8"
  charset   = "utf8"
}
