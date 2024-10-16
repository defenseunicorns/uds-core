# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

## s3 policy
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "s3_bucket_policy" {
  statement {
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:ListBucketMultipartUploads"
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:s3:::${var.bucket_name}"
    ]
  }
  statement {
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListMultipartUploadParts",
      "s3:AbortMultipartUpload"
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:s3:::${var.bucket_name}/*"
    ]
  }
  statement {
    effect = "Allow"
    actions = [
      "kms:GenerateDataKey",
      "kms:Decrypt"
    ]
    resources = [var.kms_key_arn]
  }
}

data "aws_iam_policy_document" "s3_bucket_role_policy" {

  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRoleWithWebIdentity"
    ]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
    principals {
      type        = "Federated"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${var.oidc_bucket_attributes.bucket_regional_domain_name}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_bucket_attributes.bucket_regional_domain_name}:aud"
      values   = ["irsa"]
    }
    condition {
      test     = "StringEquals"
      variable = "${var.oidc_bucket_attributes.bucket_regional_domain_name}:sub"
      values   = ["system:serviceaccount:${var.namespace}:${var.bucket_service_account}"]
    }
  }
}