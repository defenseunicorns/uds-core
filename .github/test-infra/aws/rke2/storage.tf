# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

#######################################
# Storage
#######################################
locals {
  #define workloads that need irsa configured. this will create s3 buckets and associated iam roles and policy attachments for irsa
  irsa_buckets = {
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

module "storage" {
  # this module assumes by default that you are only setting up external storage for velero and loki. modify the the irsa_buckets local above to add more. creates s3 buckets and irsa roles
  source                   = "./modules/storage"
  cluster_name             = local.cluster_name
  permissions_boundary     = local.iam_role_permissions_boundary
  use_permissions_boundary = var.use_permissions_boundary
  environment              = var.environment
  ci_bucket_configurations = local.irsa_buckets
  oidc_bucket_attributes   = merge({ s3_bucket_id = module.oidc_bucket.s3_bucket_id, bucket_regional_domain_name = module.oidc_bucket.s3_bucket_bucket_regional_domain_name })
}