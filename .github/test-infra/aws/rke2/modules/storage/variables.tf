# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "cluster_name" {
  description = "Name of the Kubernetes Cluster."
  type        = string
}

variable "ci_bucket_configurations" {
  type = map(object({
    name            = string
    service_account = string
    namespace       = string
  }))
}

variable "key_owner_arns" {
  description = "ARNS of KMS key owners, needed for use of key"
  type        = list(string)
  default     = []
}

variable "kms_key_deletion_window" {
  description = "Waiting period for scheduled KMS Key deletion. Can be 7-30 days."
  type        = number
  default     = 7
}

#irsa variables
variable "support_irsa" {
  description = "When enabled, provisions necessary resources to support accessing the s3 bucket using IRSA."
  default     = true
  type        = bool
}

variable "use_permissions_boundary" {
  description = "Whether to use IAM permissions boundary for resources."
  type        = bool
  default     = true
}

variable "permissions_boundary" {
  description = "The ARN of the Permissions Boundary"
  type        = string
  default     = null
}

variable "tags" {
  description = "A map of tags to apply to resources."
  default     = {}
  type        = map(string)
}

variable "environment" {
  type = string
}

variable "oidc_bucket_attributes" {
  description = "All attributes of the cluster OIDC bucket"
  default     = {}
}