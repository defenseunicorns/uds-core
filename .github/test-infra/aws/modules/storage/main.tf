# Terraform Module for provisioning s3 buckets with optional support for IRSA, tailored specifically for loki and velero atop uds-core
locals {
  kms_key_arns = module.generate_kms
  bucket_configurations = {
    for instance in var.ci_bucket_configurations :
    instance.name => {
      name            = "${var.cluster_name}-${instance.name}"
      bucket_name     = instance.name
      service_account = instance.service_account
      namespace       = instance.namespace
    }
  }
}

# Create KMS keys for each bucket
module "generate_kms" {
  for_each = local.bucket_configurations
  source   = "github.com/defenseunicorns/terraform-aws-uds-kms?ref=v0.0.6"

  key_owners = var.key_owner_arns
  # A list of IAM ARNs for those who will have full key permissions (`kms:*`)
  kms_key_alias_name_prefix = "${each.value.name}-" # Prefix for KMS key alias.
  kms_key_deletion_window   = var.kms_key_deletion_window
  kms_key_description       = "${var.cluster_name}-${each.value.name} nightly ci s3 KMS key" # Description for the KMS key.
  tags                      = var.tags
}

# Create s3 buckets and encrypt using keys from generate_kms module
module "s3" {
  for_each                = local.bucket_configurations
  source                  = "github.com/defenseunicorns/terraform-aws-uds-s3?ref=v0.0.6"
  name_prefix             = "${each.value.name}-"
  kms_key_arn             = local.kms_key_arns[each.key].kms_key_arn
  force_destroy           = "true"
  create_bucket_lifecycle = true

  depends_on = [
    module.generate_kms
  ]
}