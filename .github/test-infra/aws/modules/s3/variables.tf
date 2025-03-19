variable "bucket_prefix" {
  description = "Name prefix for the bucket."
  type        = string
  validation {
    condition     = length(var.bucket_prefix) <= 37
    error_message = "Name Prefix may not be longer than 37 characters."
  }
}

variable "kms_key_arn" {
  type        = string
  description = "KMS Key ARN to use for encryption"
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}

variable "irsa_role_arn" {
  description = "ARN of the IAM Policy for irsa"
  default     = ""
}

variable "create_irsa" {
  description = "Whether or not to create a bucket policy for irsa"
  default     = true
}