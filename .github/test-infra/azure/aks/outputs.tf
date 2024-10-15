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

output "grafana_pg_host" {
  description = "DB Endpoint for Grafana"
  value       = azurerm_postgresql_flexible_server.grafana_psql_server.fqdn
  sensitive   = true
}

output "grafana_pg_port" {
  description = "DB Port for Grafana"
  value       = var.db_port
}

output "grafana_pg_database" {
  description = "Database name for Grafana"
  value       = var.db_name
}

output "grafana_pg_user" {
  description = "Database username for Grafana"
  value       = var.username
}

output "grafana_pg_password" {
  description = "RDS Password for Grafana"
  value       = random_password.db_password.result
  sensitive   = true
}

output "grafana_ha" {
  value = true
}