# Prerequisites for EKS cluster that is provisioned later in this workflow via eksctl
data "aws_partition" "current" {}
locals {
  #define workloads that need irsa configured
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
  source                   = "../modules/storage"
  cluster_name             = var.name
  use_permissions_boundary = var.use_permissions_boundary
  ci_bucket_configurations = local.irsa_buckets
  environment              = var.environment
}

resource "aws_iam_policy" "loki_policy" {
  name        = "${local.irsa_buckets.loki.name}-irsa-${random_id.unique_id.hex}"
  path        = "/"
  description = "IAM policy for Loki to have necessary permissions to use S3 for storing logs."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = ["arn:${data.aws_partition.current.partition}:s3:::${module.storage.s3_buckets["loki"].bucket_name}"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:*Object"]
        Resource = ["arn:${data.aws_partition.current.partition}:s3:::${module.storage.s3_buckets["loki"].bucket_name}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ]
        Resource = [module.storage.irsa["loki"].bucket_role.arn]
      }
    ]
  })
  depends_on = [
    module.storage
  ]
}

resource "aws_iam_policy" "velero_policy" {
  name        = "${local.irsa_buckets.velero.name}-irsa-${random_id.unique_id.hex}"
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
            "arn:${data.aws_partition.current.partition}:s3:::${module.storage.s3_buckets["velero"].bucket_name}/*"
          ]
        },
        {
          Effect = "Allow",
          Action = [
            "s3:ListBucket"
          ],
          Resource = [
            "arn:${data.aws_partition.current.partition}:s3:::${module.storage.s3_buckets["velero"].bucket_name}/*"
          ]
        },
        {
          Effect = "Allow"
          Action = [
            "kms:GenerateDataKey",
            "kms:Decrypt"
          ]
          Resource = [module.storage.irsa["velero"].bucket_role.arn]
        }

      ]
  })
  depends_on = [
    module.storage
  ]
}
