# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "region" {
  description = "AWS region"
  type        = string
}

variable "name" {
  description = "Name for cluster"
  type        = string
}

variable "permissions_boundary_name" {
  description = "Name of the permissions boundary to use for IAM roles"
  type        = string
  default     = null
}

# Core Dependency Config

variable "bucket_configurations" {
  type = map(object({
    name            = string
    service_account = string
    namespace       = string
  }))
  default = {
    loki = {
      name            = "loki"
      service_account = "loki"
      namespace       = "loki"
    }
    velero = {
      name            = "velero"
      service_account = "velero-server"
      namespace       = "velero"
    }
  }
}

variable "recovery_window" {
  default = 7
  type    = number
}

variable "databases" {
  description = "Map of database configurations"
  type = map(object({
    name              = string
    port              = number
    username          = string
    engine_version    = string
    family            = string
    allocated_storage = number
    instance_class    = string
  }))
  default = {
    grafana = {
      name              = "grafana"
      port              = 5432
      username          = "grafana"
      engine_version    = "16.8"
      family            = "postgres16"
      allocated_storage = 20
      instance_class    = "db.t4g.large"
    },
    keycloak = {
      name              = "keycloak"
      port              = 5432
      username          = "keycloak"
      engine_version    = "16.8"
      family            = "postgres16"
      allocated_storage = 20
      instance_class    = "db.t4g.large"
    }
  }
}

# EKS Config

variable "kubernetes_version" {
  description = "Kubernetes version to use for the EKS cluster"
  type        = string
  default     = "1.34"
}

variable "vpc_name" {
  description = "Name of the VPC to use for the EKS cluster"
  type        = string
  default     = "uds-vpc"
}

variable "subnet_name" {
  type        = string
  description = "Name of subnet to use for testing. Can use a wildcard as long as it only matches one subnet per az."
  default     = "uds-vpc-public*"
}

variable "instance_type" {
  description = "Instance type to use for the EKS node group"
  type        = string
  default     = "m5.2xlarge"
}

variable "node_group_min_size" {
  description = "Minimum size of the EKS node group"
  type        = number
  default     = 3
}

variable "node_group_max_size" {
  description = "Maximum size of the EKS node group"
  type        = number
  default     = 3
}

variable "node_group_desired_size" {
  description = "Desired size of the EKS node group"
  type        = number
  default     = 3
}

variable "node_disk_size" {
  description = "Disk size in GB for the EKS node group"
  type        = number
  default     = 150
}
