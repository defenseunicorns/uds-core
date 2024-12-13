# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "cluster_name" {
  description = "(Required) Specifies the name of the AKS cluster."
  type        = string
  default     = "nightly-ci-aks"
}

variable "resource_group_name" {
  description = "(Required) Specifies the name of the resource group that will be created. Resources created in this terraform will be created under this resource group."
  type        = string
}

variable "location" {
  description = "(Required) Specifies the location where the AKS cluster will be deployed."
  type        = string
}

variable "dns_prefix" {
  description = "(Optional) DNS prefix specified when creating the managed cluster. Changing this forces a new resource to be created."
  type        = string
  default     = "nightly-ci"
}

variable "sku_tier" {
  description = "(Optional) The SKU Tier that should be used for this Kubernetes Cluster. Possible values are Free and Standard (which includes the Uptime SLA), and Premium. Defaults to Free."
  default     = "Standard"
  type        = string

  validation {
    condition     = contains(["Free", "Standard", "Premium"], var.sku_tier)
    error_message = "The sku tier is invalid."
  }
}

variable "kubernetes_version" {
  description = "Specifies the AKS Kubernetes version"
  default     = "1.30"
  type        = string
}

variable "enable_autoscaling" {
  description = "(Optional) Enable cluster-autoscaler on all nodepools. Defaults to true."
  type        = bool
  default     = true
}

variable "autoscaling_max_node_count" {
  description = "The maximum number of nodes to allow the default (system) node pool to scale up to."
  type        = number
  default     = 6
}

variable "autoscaling_min_node_count" {
  description = "The minimum number of nodes that should always be present in the default (system) node pool."
  type        = number
  default     = 4
}

variable "default_node_pool_vm_size" {
  description = "Specifies the vm size of the default node pool"
  default     = "Standard_F8s_v2"
  type        = string
}

variable "default_node_pool_availability_zones" {
  description = "Specifies the availability zones of the default node pool"
  default     = ["1", "2", "3"]
  type        = list(string)
}

variable "network_dns_service_ip" {
  description = "Specifies the DNS service IP"
  default     = "10.2.0.10"
  type        = string
}

variable "network_service_cidr" {
  description = "Specifies the service CIDR"
  default     = "10.2.0.0/24"
  type        = string
}

variable "network_plugin" {
  description = "Specifies the network plugin of the AKS cluster"
  default     = "azure"
  type        = string
}

variable "network_policy" {
  description = "Specifies the network policy to use"
  default     = "azure"
  type        = string
}

variable "outbound_type" {
  description = "(Optional) The outbound (egress) routing method which should be used for this Kubernetes Cluster. Possible values are loadBalancer and userDefinedRouting. Defaults to loadBalancer."
  type        = string
  default     = "loadBalancer"

  validation {
    condition     = contains(["loadBalancer", "userDefinedRouting"], var.outbound_type)
    error_message = "The outbound type is invalid."
  }
}

variable "default_node_pool_name" {
  description = "Specifies the name of the default node pool"
  default     = "system"
  type        = string
}

variable "default_node_pool_max_pods" {
  description = "(Optional) The maximum number of pods that can run on each agent. Changing this forces a new resource to be created."
  type        = number
  default     = 50
}

variable "default_node_pool_node_labels" {
  description = "(Optional) A list of Kubernetes taints which should be applied to nodes in the agent pool (e.g key=value:NoSchedule). Changing this forces a new resource to be created."
  type        = map(any)
  default     = {}
}

variable "default_node_pool_os_disk_type" {
  description = "(Optional) The type of disk which should be used for the Operating System. Possible values are Ephemeral and Managed. Defaults to Managed. Changing this forces a new resource to be created."
  type        = string
  default     = "Ephemeral"
}

variable "default_node_pool_node_count" {
  description = "(Optional) The initial number of nodes which should exist within this Node Pool. Valid values are between 0 and 1000 and must be a value in the range min_count - max_count."
  type        = number
  default     = 4
}

variable "tags" {
  description = "(Optional) Specifies the tags of the bastion host"
  type        = map(any)
  default     = {}
}

variable "azure_rbac_enabled" {
  description = "Whether or not to use Azure Role Based Access Control to control access to cluster resources."
  default     = true
}

variable "enable_key_vault_csi_driver" {
  description = "(Optional) Whether or not to deploy the Azure Key Vault CSI driver managed add-on. Defaults to false."
  type        = bool
  default     = false
}

variable "workload_identity_enabled" {
  description = "(Optional) Specifies whether Microsoft Entra ID Workload Identity should be enabled for the Cluster. Defaults to false."
  type        = bool
  default     = true
}

variable "cluster_managed_identity_type" {
  description = "Type of Managed Identity to be used for the cluster. Valid types are SystemAssigned or UserAssigned."
  type        = string
  default     = "SystemAssigned"
}

variable "cluster_kubelet_identity_type" {
  description = "Type of Managed Identity to be used for Kubelet. If UserAssigned, defaults to Azure automatically creating Managaged Identity for Kubelet."
  default     = "SystemAssigned"
}

variable "oidc_issuer_enabled" {
  description = "(Optional) Enable or Disable the OIDC issuer URL."
  type        = bool
  default     = true
}

variable "username" {
  description = "The username to use to login to the DB"
  type        = string
  default     = "grafana"
}

variable "db_port" {
  description = "The database port"
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "The name to give the database"
  type        = string
  default     = "grafana"
}
