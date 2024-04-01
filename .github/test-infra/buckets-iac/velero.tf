locals {
  velero_name  = "${var.name}-velero"
  velero_kms_key_arn = module.velero_generate_kms[0].kms_key_arn
}

module "velero_S3" {
  source                  = "github.com/defenseunicorns/terraform-aws-uds-s3?ref=v0.0.6"
  name_prefix             = "${var.velero_bucket_name}-"
  kms_key_arn             = local.velero_kms_key_arn
  force_destroy           = "true"
  create_bucket_lifecycle = true
}

resource "aws_s3_bucket_policy" "velero_bucket_policy" {
  bucket = module.velero_S3.bucket_name

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
          AWS = module.velero_irsa.role_arn
        }
        Resource = [
          module.velero_s3.bucket_arn,
          "${module.velero_s3.bucket_arn}/*"
        ]
      }
    ]
  })
}

module "velero_generate_kms" {
  count  = 1
  source = "github.com/defenseunicorns/terraform-aws-uds-kms?ref=v0.0.2"

  key_owners = var.key_owner_arns
  # A list of IAM ARNs for those who will have full key permissions (`kms:*`)
  kms_key_alias_name_prefix = "${local.velero_name}-" # Prefix for KMS key alias.
  kms_key_deletion_window   = var.kms_key_deletion_window
  # Waiting period for scheduled KMS Key deletion. Can be 7-30 days.
  kms_key_description = "${local.velero_name} UDS Core deployment Velero Key" # Description for the KMS key.
  tags = {
    Deployment = "UDS Core ${local.velero_name}"
  }
}

module "velero_irsa" {
  source                        = "github.com/defenseunicorns/terraform-aws-uds-irsa?ref=v0.0.2"
  name                          = local.velero_name
  kubernetes_service_account    = var.velero_service_account
  kubernetes_namespace          = var.velero_namespace
  oidc_provider_arn             = local.oidc_arn
  role_permissions_boundary_arn = local.iam_role_permissions_boundary

  role_policy_arns = tomap({
    "velero" = aws_iam_policy.velero_policy.arn
  })

}

resource "aws_iam_policy" "velero_policy" {
  name        = "${local.velero_name}-irsa-${random_id.unique_id.hex}"
  path        = "/"
  description = "Policy to give Velero necessary permissions for cluster backups."

  # Terraform expression result to valid JSON syntax.
  policy = jsonencode(
    {
      Version = "2012-10-17",
      Statement = [
        {
          Effect = "Allow",
          Action = [
            "ec2:DescribeVolumes",
            "ec2:DescribeSnapshots",
            "ec2:CreateTags",
            "ec2:CreateVolume",
            "ec2:CreateSnapshot",
            "ec2:DeleteSnapshot"
          ]
          Resource = [
            "*"
          ]
        },
        {
          Effect = "Allow"
          Action = [
            "s3:GetObject",
            "s3:DeleteObject",
            "s3:PutObject",
            "s3:AbortMultipartUpload",
            "s3:ListMultipartUploadParts"
          ]
          Resource = [
            "arn:${data.aws_partition.current.partition}:s3:::${module.velero_s3.bucket_name}/*"
          ]
        },
        {
          Effect = "Allow",
          Action = [
            "s3:ListBucket"
          ],
          Resource = [
            "arn:${data.aws_partition.current.partition}:s3:::${module.velero_s3.bucket_name}/*"
          ]
        },
        {
          Effect = "Allow"
          Action = [
            "kms:GenerateDataKey",
            "kms:Decrypt"
          ]
          Resource = [local.velero_kms_key_arn]
        }

      ]
  })
}

