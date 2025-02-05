# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "local_sensitive_file" "uds_config" {
  filename = "../../../bundles/aks/uds-config.yaml"
  content = yamlencode({
    "options" : {
      "architecture" : "amd64"
    },
    "variables" : {
      "core" : {
        "azure_loki_storage_account" : azurerm_storage_account.cluster_storage.name,
        "azure_loki_storage_account_access_key" : azurerm_storage_account.cluster_storage.primary_access_key,
        "azure_loki_storage_account_container" : azurerm_storage_container.loki_container.name,
        "azure_velero_storage_account" : azurerm_storage_account.cluster_storage.name,
        "azure_velero_storage_account_access_key" : azurerm_storage_account.cluster_storage.primary_access_key
        "azure_velero_storage_account_container" : azurerm_storage_container.velero_container.name,
        "azure_subscription_id" : data.azurerm_client_config.current.subscription_id,
        "azure_resource_group" : azurerm_resource_group.this.name,
        "node_resource_group_name" : "${local.cluster_name}-managed-rg"
        "grafana_pg_host" : azurerm_postgresql_flexible_server.grafana_psql_server.fqdn,
        "grafana_pg_port" : var.db_port,
        "grafana_pg_database" : var.db_name,
        "grafana_pg_password" : random_password.db_password.result,
        "grafana_pg_user" : var.username,
      }
    }
  })
}

data "azurerm_kubernetes_cluster" "aks_cluster" {
  name                = local.cluster_name
  resource_group_name = azurerm_resource_group.this.name
  depends_on          = [azapi_resource.aks_cluster]
}

resource "local_sensitive_file" "kubeconfig" {
  filename = "/home/runner/.kube/config"
  content  = data.azurerm_kubernetes_cluster.aks_cluster.kube_admin_config_raw
}