# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

data "aws_partition" "current" {}

## This will create a policy for the S3 Buckets
resource "aws_iam_policy" "s3_bucket_policy" {
  name        = "${var.resource_prefix}${var.namespace}-policy"
  path        = "/"
  description = "IRSA policy to access buckets."
  policy      = data.aws_iam_policy_document.s3_bucket_policy.json
}

## Create service account role
resource "aws_iam_role" "s3_bucket_role" {
  name                 = "${var.resource_prefix}${var.bucket_service_account}-s3-role"
  assume_role_policy   = data.aws_iam_policy_document.s3_bucket_role_policy.json
  permissions_boundary = var.permissions_boundary

  tags = {
    PermissionsBoundary = split("/", var.permissions_boundary)[1]
  }
}

resource "aws_iam_role_policy_attachment" "s3_policy_attach" {
  role       = aws_iam_role.s3_bucket_role.name
  policy_arn = aws_iam_policy.s3_bucket_policy.arn
}

resource "random_id" "unique_id" {
  byte_length = 4
}
