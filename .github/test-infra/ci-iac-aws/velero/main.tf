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
      version = ">= 4.0, != 5.17.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "3.5.1"
    }
  }
}

# taken from zarf bb repo
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
  oidc_url_without_protocol = substr(data.aws_eks_cluster.existing.identity[0].oidc[0].issuer, 8, -1)
  oidc_arn                  = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_url_without_protocol}"

  generate_kms_key              = var.create_kms_key ? 1 : 0
  kms_key_arn                   = var.kms_key_arn == null ? module.generate_kms[0].kms_key_arn : var.kms_key_arn
  name                          = "${var.name}-velero"
  iam_role_permissions_boundary = var.use_permissions_boundary ? "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}" : null

  # The conditional may need to look like this depending on how we decide to handle the way varf wants to template things
  # generate_kms_key          = var.kms_key_arn == "" ? 1 : 0
  # kms_key_arn               = var.kms_key_arn == "" ? module.generate_kms[0].kms_key_arn : var.kms_key_arn
}

module "S3" {
  source                  = "github.com/defenseunicorns/terraform-aws-uds-s3?ref=v0.0.6"
  name_prefix             = "${var.bucket_name}-"
  kms_key_arn             = local.kms_key_arn
  force_destroy           = var.force_destroy
  create_bucket_lifecycle = true
}

resource "aws_s3_bucket_policy" "bucket_policy" {
  bucket = module.S3.bucket_name

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
          AWS = module.irsa.role_arn
        }
        Resource = [
          module.S3.bucket_arn,
          "${module.S3.bucket_arn}/*"
        ]
      }
    ]
  })
}

module "generate_kms" {
  count  = local.generate_kms_key
  source = "github.com/defenseunicorns/terraform-aws-uds-kms?ref=v0.0.2"

  key_owners = var.key_owner_arns
  # A list of IAM ARNs for those who will have full key permissions (`kms:*`)
  kms_key_alias_name_prefix = "${local.name}-" # Prefix for KMS key alias.
  kms_key_deletion_window   = var.kms_key_deletion_window
  # Waiting period for scheduled KMS Key deletion. Can be 7-30 days.
  kms_key_description = "${local.name} DUBBD deployment Velero Key" # Description for the KMS key.
  tags = {
    Deployment = "UDS DUBBD ${local.name}"
  }
}

module "irsa" {
  source                        = "github.com/defenseunicorns/terraform-aws-uds-irsa?ref=v0.0.2"
  name                          = local.name
  kubernetes_service_account    = var.kubernetes_service_account
  kubernetes_namespace          = var.kubernetes_namespace
  oidc_provider_arn             = local.oidc_arn
  role_permissions_boundary_arn = local.iam_role_permissions_boundary

  role_policy_arns = tomap({
    "velero" = aws_iam_policy.velero_policy.arn
  })

}


resource "random_id" "unique_id" {
  byte_length = 4
}

resource "aws_iam_policy" "velero_policy" {
  name        = "${local.name}-irsa-${random_id.unique_id.hex}"
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
            "arn:${data.aws_partition.current.partition}:s3:::${module.S3.bucket_name}/*"
          ]
        },
        {
          Effect = "Allow",
          Action = [
            "s3:ListBucket"
          ],
          Resource = [
            "arn:${data.aws_partition.current.partition}:s3:::${module.S3.bucket_name}/*"
          ]
        },
        {
          Effect = "Allow"
          Action = [
            "kms:GenerateDataKey",
            "kms:Decrypt"
          ]
          Resource = [local.kms_key_arn]
        }

      ]
  })
}

