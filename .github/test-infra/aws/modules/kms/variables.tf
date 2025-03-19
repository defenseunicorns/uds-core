variable "kms_key_alias_name_prefix" {
  description = "Prefix for KMS key alias."
  type        = string
}

variable "kms_key_description" {
  description = "Description for the KMS key."
  type        = string
  default     = ""
}

variable "current_partition" {
  description = "Value for the AWS partition."
}

variable "account_id" {
  description = "AWS Account ID."
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}

variable "kms_key_policy_default_identities" {
  description = "A list of IAM ARNs for those who will have full key permissions (`kms:*`)"
  type        = list(string)
  default     = []
}