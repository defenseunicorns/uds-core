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

variable "loki_bucket_name" {
  description = "Name for loki S3 bucket"
  type        = string
}

variable "loki_service_account" {
  description = "Name of the service account to bind to. Used to generate fully qualified subject for service account."
  type        = string
}

variable "loki_namespace" {
  description = "Name of the namespace that the service account exists in. Used to generate fully qualified subject for the service account."
  type        = string
}

variable "velero_bucket_name" {
  description = "Name for velero S3 bucket"
  type        = string
}

variable "velero_service_account" {
  description = "Name of the service account to bind to. Used to generate fully qualified subject for service account."
  type        = string
}

variable "velero_namespace" {
  description = "Name of the namespace that the service account exists in. Used to generate fully qualified subject for the service account."
  type        = string
}
