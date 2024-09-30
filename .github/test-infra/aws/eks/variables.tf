variable "name" {
  description = "Name of cluster that is created or referenced"
  type        = string
}

variable "environment" {
  default = "ci"
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "use_permissions_boundary" {
  description = "Whether to use IAM permissions boundary for resources."
  type        = bool
}

variable "permissions_boundary_name" {
  description = "The name of the permissions boundary for IAM resources.  This will be used for tagging and to build out the ARN."
  type        = string
  default     = null
}