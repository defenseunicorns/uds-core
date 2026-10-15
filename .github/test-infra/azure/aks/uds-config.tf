# Copyright 2024-2026 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "local_sensitive_file" "uds_config" {
  filename = "../../../bundles/aks/config.uds.hcl"
  content = <<-EOT
    options {
      architecture = "amd64"
    }

    variables = {
      # Disabled to prevent scaling timing issues with image pushes
      registry_hpa_enable = false

      core = {
        azure_loki_storage_account            = ${jsonencode(azurerm_storage_account.cluster_storage.name)}
        azure_loki_storage_account_access_key = ${jsonencode(azurerm_storage_account.cluster_storage.primary_access_key)}
        azure_loki_storage_account_container  = ${jsonencode(azurerm_storage_container.loki_container.name)}

        azure_velero_storage_account            = ${jsonencode(azurerm_storage_account.cluster_storage.name)}
        azure_velero_storage_account_access_key = ${jsonencode(azurerm_storage_account.cluster_storage.primary_access_key)}
        azure_velero_storage_account_container  = ${jsonencode(azurerm_storage_container.velero_container.name)}
        azure_subscription_id                   = ${jsonencode(data.azurerm_client_config.current.subscription_id)}
        azure_resource_group                    = ${jsonencode(azurerm_resource_group.this.name)}
        node_resource_group_name                = ${jsonencode("${local.cluster_name}-managed-rg")}

        grafana_pg_host     = ${jsonencode(azurerm_postgresql_flexible_server.psql_server.fqdn)}
        grafana_pg_port     = ${jsonencode(var.db_port)}
        grafana_pg_database = ${jsonencode(azurerm_postgresql_flexible_server_database.grafana_psql_db.name)}
        grafana_pg_password = ${jsonencode(random_password.db_password.result)}
        grafana_pg_user     = ${jsonencode(var.username)}

        keycloak_db_host     = ${jsonencode(azurerm_postgresql_flexible_server.psql_server.fqdn)}
        keycloak_db_username = ${jsonencode(var.username)}
        keycloak_db_database = ${jsonencode(azurerm_postgresql_flexible_server_database.keycloak_psql_db.name)}
        keycloak_db_password = ${jsonencode(random_password.db_password.result)}
      }
    }
  EOT
}

resource "local_sensitive_file" "kubeconfig" {
  filename = pathexpand("~/.kube/config")
  content  = azurerm_kubernetes_cluster.aks_cluster.kube_admin_config_raw
}
