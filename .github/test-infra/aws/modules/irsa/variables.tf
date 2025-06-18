# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

variable "irsa_iam_role_name" {
  type        = string
  description = "IAM role name for IRSA, overrides name variable for irsa module input `role_name`"
  default     = ""
}

variable "role_permissions_boundary_arn" {
  description = "Permissions boundary ARN to use for IAM role"
}

variable "oidc_providers" {
  description = "Map of OIDC providers where each provider map should contain the `provider_arn` and `namespace_service_accounts`"
  type        = any
  default     = {}
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}

variable "role_policy_arns" {
  description = "ARNs of any policies to attach to the IAM role"
  type        = map(string)
  default     = {}
}

variable "allow_self_assume_role" {
  description = "Determines whether to allow the role to be [assume itself](https://aws.amazon.com/blogs/security/announcing-an-update-to-iam-role-trust-policy-behavior/)"
  type        = bool
  default     = false
}

variable "current_partition" {
  description = "Value for the AWS partition."
}

variable "account_id" {
  description = "AWS Account ID."
}

variable "kubernetes_service_account" {
  description = "Name of the service account to bind to. Used to generate fully qualified subject for service account."
  type        = string
}

variable "name" {
  type        = string
  description = "Cluster name, used in the name of the iam role that is created"
  default     = "irsa-role"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for the IRSA policy to allow access to encrypted resources"
}
