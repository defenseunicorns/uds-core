# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "aws_iam_policy" "velero_policy" {
  name        = "${local.bucket_configurations.velero.name}-irsa-${random_id.unique_id.hex}"
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
            "ec2:DescribeSnapshots"
          ],
          Resource = ["*"]
        },
        {
          Effect   = "Allow",
          Action   = ["ec2:CreateVolume"],
          Resource = ["*"],
          Condition = {
            StringEquals = {
              "aws:RequestTag/kubernetes.io/cluster/${var.name}" = "owned"
            }
          }
        },
        {
          Effect   = "Allow",
          Action   = ["ec2:CreateSnapshot"],
          Resource = ["*"],
          Condition = {
            StringEquals = {
              "aws:RequestTag/kubernetes.io/cluster/${var.name}" = "owned"
            }
          }
        },
        {
          Effect   = "Allow",
          Action   = ["ec2:CreateSnapshot"],
          Resource = ["*"],
          Condition = {
            StringEquals = {
              "ec2:ResourceTag/kubernetes.io/cluster/${var.name}" = "owned"
            }
          }
        },
        {
          Effect   = "Allow",
          Action   = ["ec2:DeleteSnapshot"],
          Resource = ["*"],
          Condition = {
            StringEquals = {
              "ec2:ResourceTag/kubernetes.io/cluster/${var.name}" = "owned"
            }
          }
        },
        {
          Effect   = "Allow",
          Action   = ["ec2:CreateTags"],
          Resource = ["*"],
          Condition = {
            "StringEquals" = {
              "aws:RequestTag/kubernetes.io/cluster/${var.name}" = "owned"
            },
            "StringEqualsIfExists" = {
              "ec2:ResourceTag/kubernetes.io/cluster/${var.name}" = "owned"
            }
          }
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
            "arn:${data.aws_partition.current.partition}:s3:::${module.S3["velero"].bucket_name}/*"
          ]
        },
        {
          Effect = "Allow",
          Action = [
            "s3:ListBucket"
          ],
          Resource = [
            "arn:${data.aws_partition.current.partition}:s3:::${module.S3["velero"].bucket_name}/*"
          ]
        },
        {
          Effect = "Allow"
          Action = [
            "kms:GenerateDataKey",
            "kms:Decrypt"
          ]
          Resource = [module.generate_kms["velero"].kms_key_arn]
        }

      ]
  })
}
