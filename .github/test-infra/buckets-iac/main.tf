provider "aws" {
  region = var.region

  default_tags {
    tags = {
      PermissionsBoundary = var.permissions_boundary_name
    }
  }
}

terraform {
  required_version = "1.5.7"
  backend "s3" {
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 4.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "3.5.1"
    }
  }
}

resource "random_id" "default" {
  byte_length = 2
}

data "aws_eks_cluster" "existing" {
  name = var.name
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_region" "current" {}

locals {
  oidc_url_without_protocol     = substr(data.aws_eks_cluster.existing.identity[0].oidc[0].issuer, 8, -1)
  oidc_arn                      = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_url_without_protocol}"
  iam_role_permissions_boundary = var.use_permissions_boundary ? "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}" : null

  bucket_configurations = {
    for instance in var.bucket_configurations :
    instance.name => {
      name            = "${var.name}-${instance.name}"
      service_account = instance.service_account
      namespace       = instance.namespace
    }
  }

  kms_key_arns = module.generate_kms

  iam_policies = {
    "loki"   = resource.aws_iam_policy.loki_policy.arn
    "velero" = resource.aws_iam_policy.velero_policy.arn
  }
}

resource "random_id" "unique_id" {
  byte_length = 4
}

module "generate_kms" {
  for_each = local.bucket_configurations
  source   = "github.com/defenseunicorns/terraform-aws-uds-kms?ref=v0.0.2"

  key_owners = var.key_owner_arns
  # A list of IAM ARNs for those who will have full key permissions (`kms:*`)
  kms_key_alias_name_prefix = "${each.value.name}-" # Prefix for KMS key alias.
  kms_key_deletion_window   = var.kms_key_deletion_window
  # Waiting period for scheduled KMS Key deletion. Can be 7-30 days.
  kms_key_description = "${var.name} UDS Core deployment Loki Key" # Description for the KMS key.
  tags = {
    Deployment = "UDS Core ${each.value.name}"
  }
}

module "S3" {
  for_each                = local.bucket_configurations
  source                  = "github.com/defenseunicorns/terraform-aws-uds-s3?ref=v0.0.6"
  name_prefix             = "${each.value.name}-"
  kms_key_arn             = local.kms_key_arns[each.key].kms_key_arn
  force_destroy           = "true"
  create_bucket_lifecycle = true
}

module "irsa" {
  for_each                      = local.bucket_configurations
  source                        = "github.com/defenseunicorns/terraform-aws-uds-irsa?ref=v0.0.2"
  name                          = each.value.name
  kubernetes_service_account    = each.value.service_account
  kubernetes_namespace          = each.value.namespace
  oidc_provider_arn             = local.oidc_arn
  role_permissions_boundary_arn = local.iam_role_permissions_boundary

  role_policy_arns = tomap({
    "${each.key}" = local.iam_policies[each.key]
  })
}

resource "aws_s3_bucket_policy" "bucket_policy" {
  for_each = local.bucket_configurations
  bucket   = module.S3[each.key].bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject"
        ]
        Effect = "Allow"
        Principal = {
          AWS = module.irsa[each.key].role_arn
        }
        Resource = [
          module.S3[each.key].bucket_arn,
          "${module.S3[each.key].bucket_arn}/*"
        ]
      }
    ]
  })
}
