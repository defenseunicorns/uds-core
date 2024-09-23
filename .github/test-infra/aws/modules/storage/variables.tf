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

variable "permissions_boundary_name" {
  description = "The name of the permissions boundary for IAM resources.  This will be used for tagging and to build out the ARN."
  type        = string
  default     = null
}

variable "tags" {
  description = "A map of tags to apply to resoruces."
  default     = {}
  type        = map(string)
}