# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial


data "azurerm_client_config" "current" {}

locals {
  cluster_name = "${var.cluster_name}-${random_string.name.result}"
}

resource "random_string" "name" {
  length  = 4
  special = false
  upper   = false
  numeric = false
}

## resource group that cluster will be created in
resource "azurerm_resource_group" "this" {
  name     = "${var.resource_group_name}-${random_string.name.result}"
  location = var.location
}

resource "azurerm_role_assignment" "cluster_admin" {
  scope                = azurerm_kubernetes_cluster.aks_cluster.id
  role_definition_name = "Azure Kubernetes Service RBAC Cluster Admin"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "aks_network_role" {
  principal_id         = azurerm_kubernetes_cluster.aks_cluster.identity[0].principal_id
  role_definition_name = "Network Contributor"
  scope                = azurerm_resource_group.this.id
}

### CSI Driver identity. Required if workload_identity_enabled is true
resource "azurerm_user_assigned_identity" "workload_identity" {
  count               = var.workload_identity_enabled ? 1 : 0
  location            = var.location
  name                = "${local.cluster_name}-workload-identity"
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_kubernetes_cluster" "aks_cluster" {
  name                      = local.cluster_name
  location                  = var.location
  resource_group_name       = azurerm_resource_group.this.name
  kubernetes_version        = var.kubernetes_version
  dns_prefix                = var.dns_prefix
  sku_tier                  = var.sku_tier
  workload_identity_enabled = var.workload_identity_enabled
  oidc_issuer_enabled       = var.oidc_issuer_enabled

  default_node_pool {
    name                 = var.default_node_pool_name
    auto_scaling_enabled = var.enable_autoscaling
    vnet_subnet_id       = azurerm_subnet.cluster_node_subnet.id
    max_count            = var.enable_autoscaling ? var.autoscaling_max_node_count : null
    min_count            = var.enable_autoscaling ? var.autoscaling_max_node_count : null
    vm_size              = var.default_node_pool_vm_size
    zones                = var.default_node_pool_availability_zones
    node_labels          = var.default_node_pool_node_labels
    max_pods             = var.default_node_pool_max_pods
    node_count           = var.default_node_pool_node_count
    os_disk_type         = var.default_node_pool_os_disk_type
    tags                 = var.tags
  }

  identity {
    type = "SystemAssigned"
  }

  azure_active_directory_role_based_access_control {
    azure_rbac_enabled     = true
    admin_group_object_ids = []
  }

  dynamic "key_vault_secrets_provider" {
    for_each = var.enable_key_vault_csi_driver ? { "enabled" = true } : {}
    content {
      secret_rotation_enabled = key_vault_secrets_provider.value
    }
  }

  storage_profile {
    blob_driver_enabled = false
    file_driver_enabled = true
  }

  network_profile {
    dns_service_ip = var.network_dns_service_ip
    network_plugin = var.network_plugin
    network_policy = var.network_policy
    outbound_type  = var.outbound_type
    service_cidr   = var.network_service_cidr
  }

  lifecycle {
    ignore_changes = [
      kubernetes_version,
      tags
    ]
  }

  depends_on = [
    azurerm_resource_group.this
  ]
}

resource "azurerm_kubernetes_cluster_node_pool" "worker" {
  name                  = "worker1"
  mode                  = "User"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.aks_cluster.id
  vm_size               = var.worker_pool_vm_size
  auto_scaling_enabled  = var.enable_autoscaling
  min_count             = var.enable_autoscaling ? var.autoscaling_min_node_count_worker : null
  max_count             = var.enable_autoscaling ? var.autoscaling_max_node_count_worker : null
  node_count            = var.worker_node_pool_count
}

resource "kubernetes_horizontal_pod_autoscaler_v2" "konnectivity-hpa" {
  metadata {
    name      = "konnectivity-hpa"
    namespace = "kube-system"
  }
  spec {
    max_replicas                      = 5
    min_replicas                      = 3
    target_cpu_utilization_percentage = 75
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = "konnectivity-agent"
    }
    behavior {
      scale_down {
        policy {
          period_seconds = 1800
          type = pods
          value = 1
        }
      }
    }
  }
  depends_on = [azurerm_kubernetes_cluster.aks_cluster]
}
