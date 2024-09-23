# IRSA can be used to grant in-cluster applications access to s3, as opposed to access keys
locals {
  oidc_url_without_protocol     = substr(data.aws_eks_cluster.existing.identity[0].oidc[0].issuer, 8, -1)
  oidc_arn                      = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_url_without_protocol}"
  iam_role_permissions_boundary = var.use_permissions_boundary ? "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}" : null
  iam_policies = {
    "loki"   = resource.aws_iam_policy.loki_policy[0].arn
    "velero" = resource.aws_iam_policy.velero_policy[0].arn
  }
}

module "irsa" {
  for_each                      = var.bucket_configurations
  source                        = "github.com/defenseunicorns/terraform-aws-uds-irsa?ref=v0.0.3"
  name                          = each.value.name
  kubernetes_service_account    = each.value.service_account
  kubernetes_namespace          = each.value.namespace
  oidc_provider_arn             = local.oidc_arn
  role_permissions_boundary_arn = local.iam_role_permissions_boundary

  role_policy_arns = tomap({
    "${each.key}" = local.iam_policies[each.key]
  })
}

resource "random_id" "unique_id" {
  byte_length = 4
}

# IRSA policy for loki
resource "aws_iam_policy" "loki_policy" {
  count       = contains(keys(var.bucket_configurations), "loki") ? 1 : 0
  name        = "${var.bucket_configurations.loki.name}-irsa-${random_id.unique_id.hex}"
  path        = "/"
  description = "IAM policy for Loki to have necessary permissions to use S3 for storing logs."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = ["arn:${data.aws_partition.current.partition}:s3:::${var.bucket_configurations.loki.bucket_name}"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:*Object"]
        Resource = ["arn:${data.aws_partition.current.partition}:s3:::${var.bucket_configurations.loki.bucket_name}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt"
        ]
        Resource = [var.bucket_configurations["loki"].kms_key_arn]
      }
    ]
  })
}

# IRSA policy for velero
resource "aws_iam_policy" "velero_policy" {
  count       = contains(keys(var.bucket_configurations), "velero") ? 1 : 0
  name        = "${var.bucket_configurations.velero.name}-irsa-${random_id.unique_id.hex}"
  path        = "/"
  description = "Policy to give Velero necessary permissions for cluster backups."
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
            "arn:${data.aws_partition.current.partition}:s3:::${var.bucket_configurations.velero.bucket_name}/*"
          ]
        },
        {
          Effect = "Allow",
          Action = [
            "s3:ListBucket"
          ],
          Resource = [
            "arn:${data.aws_partition.current.partition}:s3:::${var.bucket_configurations.velero.bucket_name}/*"
          ]
        },
        {
          Effect = "Allow"
          Action = [
            "kms:GenerateDataKey",
            "kms:Decrypt"
          ]
          Resource = [var.bucket_configurations["velero"].kms_key_arn]
        }
      ]
  })
}