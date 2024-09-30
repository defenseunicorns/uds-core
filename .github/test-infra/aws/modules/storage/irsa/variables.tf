variable "cluster_name" {
  description = "Name of the Kubernetes Cluster."
  type        = string
}

variable "bucket_configuration" {
  description = "A map of objects that determines necessary mappings for k8s resources to IRSA roles"
  type = map(object({
    name            = string
    bucket_name     = string
    service_account = string
    namespace       = string
    kms_key_arn     = string
  }))
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

variable "namespace" {
  description = "Namespace for the IAM S3 Bucket Role"
  type        = string
}

variable "serviceaccount_name" {
  description = "List of service accounts"
  type        = string
}

variable "resource_prefix" {
  description = "Prefix for resources created"
  type        = string
}

variable "oidc_bucket_attributes" {
  description = "All attributes of the cluster OIDC bucket"
  default     = {}
}