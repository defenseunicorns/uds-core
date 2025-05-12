# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

output "storage_account_name" {
  description = "Specifies the name of the storage account"
  value       = azurerm_storage_account.cluster_storage.name
  sensitive   = true
}

output "storage_account_access_key" {
  description = "Specifies the primary access key of the storage account"
  value       = azurerm_storage_account.cluster_storage.primary_access_key
  sensitive   = true
}

output "resource_group_name" {
  value     = azurerm_resource_group.this.name
  sensitive = true
}

output "loki_blob_container_name" {
  value     = azurerm_storage_container.loki_container.name
  sensitive = true
}

output "velero_blob_container_name" {
  value     = azurerm_storage_container.velero_container.name
  sensitive = true
}

output "subscription_id" {
  value     = data.azurerm_client_config.current.subscription_id
  sensitive = true
}

output "pg_host" {
  description = "DB Endpoint"
  value       = azurerm_postgresql_flexible_server.psql_server.fqdn
  sensitive   = true
}

output "pg_port" {
  description = "DB Port"
  value       = var.db_port
}

output "grafana_pg_database" {
  description = "Database name for Grafana"
  value       = azurerm_postgresql_flexible_server_database.grafana_psql_db.name
}

output "grafana_pg_user" {
  description = "Database username"
  value       = var.username
}

output "grafana_pg_password" {
  description = "RDS Password"
  value       = random_password.db_password.result
  sensitive   = true
}

output "grafana_ha" {
  value = true
}

output "keycloak_pg_database" {
  description = "Database name for Keycloak"
  value       = azurerm_postgresql_flexible_server_database.keycloak_psql_db.name
}