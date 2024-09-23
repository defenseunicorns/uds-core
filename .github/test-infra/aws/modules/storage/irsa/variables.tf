variable "cluster_name" {
  description = "Name of the Kubernetes Cluster."
  type        = string
}

variable "bucket_configurations" {
  description = "A map of objects that determines necessary mappings for k8s resources to IRSA roles"
  type = map(object({
    name            = string
    bucket_name     = string
    service_account = string
    namespace       = string
    kms_key_arn     = string
  }))
}

variable "permissions_boundary_name" {
  description = "The name of the permissions boundary for IAM resources.  This will be used for tagging and to build out the ARN."
  type        = string
  default     = null
}

variable "use_permissions_boundary" {
  description = "Whether to use IAM permissions boundary for resources."
  type        = bool
}