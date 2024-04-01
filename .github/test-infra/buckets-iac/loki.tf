locals {
  loki_name                          = "${var.name}-loki"
  loki_kms_key_arn = module.loki_generate_kms[0].kms_key_arn
}

module "loki_S3" {
  source                  = "github.com/defenseunicorns/terraform-aws-uds-s3?ref=v0.0.6"
  name_prefix             = "${var.loki_bucket_name}-"
  kms_key_arn             = local.loki_kms_key_arn
  force_destroy           = var.force_destroy
  create_bucket_lifecycle = true
}

resource "aws_s3_bucket_policy" "loki_bucket_policy" {
  bucket = module.loki_S3.bucket_name

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
          AWS = module.loki_irsa.role_arn
        }
        Resource = [
          module.loki_s3.bucket_arn,
          "${module.loki_s3.bucket_arn}/*"
        ]
      }
    ]
  })
}

module "loki_generate_kms" {
  count  = 1
  source = "github.com/defenseunicorns/terraform-aws-uds-kms?ref=v0.0.2"

  key_owners = var.key_owner_arns
  # A list of IAM ARNs for those who will have full key permissions (`kms:*`)
  kms_key_alias_name_prefix = "${local.loki_name}-" # Prefix for KMS key alias.
  kms_key_deletion_window   = var.kms_key_deletion_window
  # Waiting period for scheduled KMS Key deletion. Can be 7-30 days.
  kms_key_description = "${var.name} UDS Core deployment Loki Key" # Description for the KMS key.
  tags = {
    Deployment = "UDS Core ${local.loki_name}"
  }
}


module "loki_irsa" {
  source                        = "github.com/defenseunicorns/terraform-aws-uds-irsa?ref=v0.0.2"
  name                          = local.loki_name
  kubernetes_service_account    = var.loki_service_account
  kubernetes_namespace          = var.loki_namespace
  oidc_provider_arn             = local.oidc_arn
  role_permissions_boundary_arn = local.iam_role_permissions_boundary

  role_policy_arns = tomap({
    "loki" = aws_iam_policy.loki_policy.arn
  })

}

resource "aws_iam_policy" "loki_policy" {
  name        = "${local.loki_name}-irsa-${random_id.unique_id.hex}"
  path        = "/"
  description = "IAM policy for Loki to have necessary permissions to use S3 for storing logs."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = ["arn:${data.aws_partition.current.partition}:s3:::${module.loki_s3.bucket_name}"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:*Object"]
        Resource = ["arn:${data.aws_partition.current.partition}:s3:::${module.loki_s3.bucket_name}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ]
        Resource = [local.loki_kms_key_arn]
      }
    ]
  })
}
