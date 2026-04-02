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
  tags = {
    "Owner" = "UDS Foundations"
  }
}

resource "azurerm_log_analytics_workspace" "aks" {
  count               = var.enable_control_plane_logs ? 1 : 0
  name                = "${local.cluster_name}-law"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_analytics_retention_days
  tags                = var.tags
}

resource "azurerm_role_assignment" "cluster_admin" {
  scope                = azurerm_kubernetes_cluster.aks_cluster.id
  role_definition_name = "Azure Kubernetes Service RBAC Cluster Admin"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "cluster_dns" {
  scope                = azurerm_private_dns_zone.cluster_dns_zone.id
  role_definition_name = "Private DNS Zone Contributor"
  principal_id         = azurerm_user_assigned_identity.cluster_identity.principal_id
}

resource "azurerm_role_assignment" "aks_network_role" {
  principal_id         = azurerm_user_assigned_identity.cluster_identity.principal_id
  role_definition_name = "Network Contributor"
  scope                = azurerm_resource_group.this.id
}

## Cluster user assigned identity. Required for API server vnet integration
resource "azurerm_user_assigned_identity" "cluster_identity" {
  location            = var.location
  name                = "${local.cluster_name}-identity"
  resource_group_name = azurerm_resource_group.this.name
}

resource "azurerm_kubernetes_cluster" "aks_cluster" {
  name                = local.cluster_name
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  depends_on          = [azurerm_role_assignment.aks_network_role]

  tags = {
    Owner = "UDS Foundations"
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.cluster_identity.id]
  }

  azure_active_directory_role_based_access_control {
    azure_rbac_enabled = var.azure_rbac_enabled
    tenant_id          = data.azurerm_client_config.current.tenant_id
  }

  node_resource_group = "${local.cluster_name}-managed-rg"

  api_server_access_profile {
    virtual_network_integration_enabled = true
    subnet_id                           = azurerm_subnet.cluster_api_subnet.id
  }

  local_account_disabled            = false
  dns_prefix                        = var.dns_prefix
  kubernetes_version                = var.kubernetes_version
  role_based_access_control_enabled = true

  network_profile {
    dns_service_ip      = var.network_dns_service_ip
    service_cidr        = var.network_service_cidr
    load_balancer_sku   = "standard"
    network_data_plane  = "azure"
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_policy      = "azure"
    outbound_type       = var.outbound_type
  }

  storage_profile {
    blob_driver_enabled         = false
    disk_driver_enabled         = true
    file_driver_enabled         = true
    snapshot_controller_enabled = true
  }

  oidc_issuer_enabled = true
  support_plan        = "KubernetesOfficial"
  sku_tier            = var.sku_tier

  default_node_pool {
    name                        = var.default_node_pool_name
    vm_size                     = var.default_node_pool_vm_size
    vnet_subnet_id              = azurerm_subnet.cluster_node_subnet.id
    zones                       = var.default_node_pool_availability_zones
    temporary_name_for_rotation = "tmp"
    max_pods                    = var.default_node_pool_max_pods

    os_sku          = "Ubuntu"
    os_disk_size_gb = 128
    os_disk_type    = var.default_node_pool_os_disk_type

    node_public_ip_enabled  = false
    host_encryption_enabled = false
    fips_enabled            = false
    ultra_ssd_enabled       = false
    kubelet_disk_type       = "OS"
    scale_down_mode         = "Delete"
    type                    = "VirtualMachineScaleSets"

    auto_scaling_enabled = var.enable_autoscaling
    node_count           = var.default_node_pool_node_count

    upgrade_settings {
      max_surge = "10%"
    }
  }
}

resource "azurerm_monitor_diagnostic_setting" "aks_control_plane" {
  count                      = var.enable_control_plane_logs ? 1 : 0
  name                       = "${local.cluster_name}-controlplane"
  target_resource_id         = azurerm_kubernetes_cluster.aks_cluster.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.aks[0].id

  dynamic "enabled_log" {
    for_each = toset(var.control_plane_log_categories)
    content {
      category = enabled_log.value
    }
  }
}
