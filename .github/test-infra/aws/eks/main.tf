# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

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
  for_each                  = local.bucket_configurations
  source                    = "../modules/kms"
  kms_key_alias_name_prefix = "${each.value.name}-"
  kms_key_description       = "${var.name} UDS Core ${each.value.name} key"
  current_partition         = data.aws_partition.current.partition
  account_id                = data.aws_caller_identity.current.account_id
  tags = {
    Deployment = "UDS Core ${each.value.name}"
  }
}

module "S3" {
  for_each      = local.bucket_configurations
  source        = "../modules/s3"
  bucket_prefix = "${each.value.name}-"
  kms_key_arn   = module.generate_kms[each.key].kms_key_arn
  irsa_role_arn = module.irsa[each.key].role_arn
}

module "irsa" {
  for_each                      = local.bucket_configurations
  source                        = "../modules/irsa"
  name                          = each.value.name
  kubernetes_service_account    = each.value.service_account
  role_permissions_boundary_arn = local.iam_role_permissions_boundary
  account_id                    = data.aws_caller_identity.current.account_id
  current_partition             = data.aws_partition.current.partition

  oidc_providers = {
    main = {
      provider_arn               = local.oidc_arn
      namespace_service_accounts = [format("%s:%s", each.value.namespace, each.value.service_account)]
    }
  }
  role_policy_arns = tomap({
    "${each.key}" = local.iam_policies[each.key]
  })
}
