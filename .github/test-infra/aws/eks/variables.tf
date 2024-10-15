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
  description = "The name of the permissions boundary for IAM resources.  This will be used for tagging and to build out the ARN."
  type        = string
  default     = null
}

variable "use_permissions_boundary" {
  description = "Whether to use IAM permissions boundary for resources."
  type        = bool
  default     = true
}

variable "key_owner_arns" {
  description = "ARNS of KMS key owners, needed for use of key"
  type        = list(string)
  default     = []
}

# taken from zarf bb repo
variable "kms_key_deletion_window" {
  description = "Waiting period for scheduled KMS Key deletion. Can be 7-30 days."
  type        = number
  default     = 7
}

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

variable "db_name" {
  description = "The name to give the database"
  type        = string
  default     = "grafana"
}

variable "db_port" {
  description = "The database port"
  type        = number
  default     = 5432
}

variable "username" {
  description = "The username to use to login to the DB"
  type        = string
  default     = "grafana"
}

variable "db_engine_version" {
  description = "The Postgres engine version to use for the DB"
  type        = string
  default     = "15.7"
}

variable "db_allocated_storage" {
  description = "Storage allocated to RDS instance"
  type        = number
  default     = 20
}

variable "db_storage_type" {
  description = "The type of storage (e.g., gp2, io1)"
  type        = string
  default     = "gp2"
}

variable "db_instance_class" {
  description = "The class of RDS instance (e.g., db.t4g.large)"
  type        = string
  default     = "db.t4g.large"
}
