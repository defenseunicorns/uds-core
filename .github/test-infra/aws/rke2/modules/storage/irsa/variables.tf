# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "cluster_name" {
  description = "Name of the Kubernetes Cluster."
  type        = string
}

variable "bucket_service_account" {
  description = "Service account used by the workload"
  type        = string
}

variable "name" {
  description = "Name of the configuration"
}

variable "bucket_name" {
  description = "Name of the s3 bucket"
}

variable "namespace" {
  description = "Namespace that the service account is deployed to"
}

variable "kms_key_arn" {
  description = "ARN of the encryption key used for the s3 bucket"
}

variable "permissions_boundary" {
  description = "The ARN of the Permissions Boundary"
}
variable "use_permissions_boundary" {
  description = "Whether to use IAM permissions boundary for resources."
  type        = bool
  default     = true
}

variable "environment" {
  type = string
}

variable "resource_prefix" {
  description = "Prefix for resources created"
  type        = string
}

variable "oidc_bucket_attributes" {
  description = "All attributes of the cluster OIDC bucket"
  default     = {}
}