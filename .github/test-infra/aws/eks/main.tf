# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
locals {
  # Generate deterministic subnet CIDRs based on cluster name
  # Use 172.168.x.x/24 to match the VPC CIDR (172.168.0.0/16)
  generated_subnet_cidr = "172.168.${random_integer.subnet_octet_3.result}.0/24"
  subnet_cidr           = var.subnet_cidr != "" ? var.subnet_cidr : local.generated_subnet_cidr
  subnet_cidr_second    = "172.168.${random_integer.subnet_octet_3_second.result}.0/24"

  # Combine subnet IDs for EKS
  subnet_ids = [aws_subnet.cluster_subnet.id, aws_subnet.cluster_subnet_second.id]

  # Tags for resources
  tags = {
    Name                = var.name
    Environment         = "ci"
    PermissionsBoundary = var.permissions_boundary_name
  }

  # Bucket configurations for IRSA
  bucket_configurations = {
    for instance in var.bucket_configurations :
    instance.name => {
      name            = "${var.name}-${instance.name}"
      service_account = instance.service_account
      namespace       = instance.namespace
    }
  }

  # IAM policies for IRSA
  iam_policies = {
    "loki"   = resource.aws_iam_policy.loki_policy.arn
    "velero" = resource.aws_iam_policy.velero_policy.arn
  }
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

  # Explicit dependency on EKS cluster
  depends_on = [
    module.eks
  ]
}

module "S3" {
  for_each      = local.bucket_configurations
  source        = "../modules/s3"
  bucket_prefix = "${each.value.name}-"
  kms_key_arn   = module.generate_kms[each.key].kms_key_arn
  irsa_role_arn = module.irsa[each.key].role_arn

  # Explicit dependency on KMS
  depends_on = [
    module.generate_kms
  ]
}

module "irsa" {
  for_each                      = local.bucket_configurations
  source                        = "../modules/irsa"
  name                          = each.value.name
  kubernetes_service_account    = each.value.service_account
  role_permissions_boundary_arn = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}"
  account_id                    = data.aws_caller_identity.current.account_id
  current_partition             = data.aws_partition.current.partition

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = [format("%s:%s", each.value.namespace, each.value.service_account)]
    }
  }
  role_policy_arns = tomap({
    (each.key) = local.iam_policies[each.key]
  })

  # Explicit dependency on EKS cluster
  depends_on = [
    module.eks,
    aws_iam_policy.loki_policy,
    aws_iam_policy.velero_policy
  ]
}
