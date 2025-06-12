# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial


data "azurerm_client_config" "current" {}

locals {
  cluster_name        = "${var.cluster_name}-${random_string.name.result}"
  cluster_resource_id = provider::azapi::build_resource_id(azurerm_resource_group.this.id, "Microsoft.ContainerService/ManagedClusters", local.cluster_name)
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

resource "azurerm_role_assignment" "cluster_admin" {
  scope                = local.cluster_resource_id
  role_definition_name = "Azure Kubernetes Service RBAC Cluster Admin"
  principal_id         = data.azurerm_client_config.current.object_id
  depends_on           = [azapi_resource.aks_cluster]
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

# Create cluster via API call because API server VNET integration will not be added to the azurerm provider until it is GA
# Tracking GA availability: https://github.com/Azure/AKS/issues/2729
# Tracking support in azurerm provider: https://github.com/hashicorp/terraform-provider-azurerm/issues/27640
resource "azapi_resource" "aks_cluster" {
  type      = "Microsoft.ContainerService/ManagedClusters@2024-09-02-preview"
  name      = local.cluster_name
  parent_id = azurerm_resource_group.this.id
  location  = azurerm_resource_group.this.location
  tags = {
    "Owner" = "UDS Foundations"
  }

  body = {
    identity = {
      type = "UserAssigned",
      userAssignedIdentities = {
        (azurerm_user_assigned_identity.cluster_identity.id) = {}
      }
    }
    properties = {
      aadProfile = {
        adminGroupObjectIDs = null
        enableAzureRBAC     = var.azure_rbac_enabled
        managed             = true
      }
      servicePrincipalProfile = {
        clientId = "msi"
      }
      nodeResourceGroup = "${local.cluster_name}-managed-rg"
      apiServerAccessProfile = {
        enableVnetIntegration = true,
        subnetId              = azurerm_subnet.cluster_api_subnet.id
      }
      agentPoolProfiles = [
        {
          availabilityZones      = var.default_node_pool_availability_zones
          count                  = var.default_node_pool_node_count
          enableAutoScaling      = var.enable_autoscaling
          enableEncryptionAtHost = false
          enableFIPS             = false
          enableNodePublicIP     = false
          enableUltraSSD         = false
          kubeletDiskType        = "OS"
          maxPods                = var.default_node_pool_max_pods
          mode                   = "System"
          name                   = var.default_node_pool_name
          orchestratorVersion    = var.kubernetes_version
          osDiskSizeGB           = 128
          osDiskType             = var.default_node_pool_os_disk_type
          osSKU                  = "Ubuntu"
          osType                 = "Linux"
          scaleDownMode          = "Delete"
          type                   = "VirtualMachineScaleSets"
          upgradeSettings = {
            maxSurge = "10%"
          }
          vmSize       = var.default_node_pool_vm_size
          vnetSubnetID = "${azurerm_subnet.cluster_node_subnet.id}"
        },
        {
          count                  = var.worker_node_pool_count
          enableAutoScaling      = var.enable_autoscaling
          enableEncryptionAtHost = false
          enableFIPS             = false
          enableNodePublicIP     = false
          enableUltraSSD         = false
          kubeletDiskType        = "OS"
          maxPods                = 30
          mode                   = "User"
          name                   = "worker1"
          orchestratorVersion    = var.kubernetes_version
          osDiskSizeGB           = 128
          osDiskType             = "Managed"
          osSKU                  = "Ubuntu"
          osType                 = "Linux"
          scaleDownMode          = "Delete"
          type                   = "VirtualMachineScaleSets"
          vmSize                 = var.worker_pool_vm_size
          vnetSubnetID           = "${azurerm_subnet.cluster_worker_node_subnet.id}"
        },
      ]
      autoUpgradeProfile = {
        nodeOSUpgradeChannel = "NodeImage"
        upgradeChannel       = "none"
      }
      azureMonitorProfile = {
        metrics = {
          enabled          = false
          kubeStateMetrics = {}
        }
      }
      disableLocalAccounts = false
      dnsPrefix            = var.dns_prefix
      enableRBAC           = true
      identityProfile      = {}
      kubernetesVersion    = var.kubernetes_version
      networkProfile = {
        dnsServiceIP = var.network_dns_service_ip
        ipFamilies = [
          "IPv4",
        ]
        loadBalancerSku  = "standard"
        networkDataplane = "azure"
        networkPlugin    = "azure"
        networkPolicy    = "azure"
        outboundType     = var.outbound_type
        serviceCidr      = var.network_service_cidr
        serviceCidrs = [
          var.network_service_cidr,
        ]
      }
      storageProfile = {
        blobCSIDriver = {
          enabled = false
        }
        diskCSIDriver = {
          enabled = true
        }
        fileCSIDriver = {
          enabled = true
        }
        snapshotController = {
          enabled = true
        }
      }
      oidcIssuerProfile = {
        "enabled" = true
      }
      supportPlan = "KubernetesOfficial"
    }
    sku = {
      name = "Base"
      tier = var.sku_tier
    }
  }
}
