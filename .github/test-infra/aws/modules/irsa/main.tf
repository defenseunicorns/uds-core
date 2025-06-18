# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

locals {
  irsa_role_name = try(coalesce(var.irsa_iam_role_name, format("%s-%s-%s", var.name, trim(var.kubernetes_service_account, "-*"), "irsa")), null)
}

# TRUST POLICY
data "aws_iam_policy_document" "trust_policy" {
  dynamic "statement" {
    for_each = var.oidc_providers

    content {
      effect  = "Allow"
      actions = ["sts:AssumeRoleWithWebIdentity"]

      principals {
        type        = "Federated"
        identifiers = [statement.value.provider_arn]
      }

      condition {
        test     = "StringEquals"
        variable = "${replace(statement.value.provider_arn, "/^(.*provider/)/", "")}:sub"
        values   = [for sa in statement.value.namespace_service_accounts : "system:serviceaccount:${sa}"]
      }

      condition {
        test     = "StringEquals"
        variable = "${replace(statement.value.provider_arn, "/^(.*provider/)/", "")}:aud"
        values   = ["sts.amazonaws.com"]
      }
    }
  }
}

# IAM ROLE
resource "aws_iam_role" "this" {
  name                  = local.irsa_role_name
  description           = "AWS IAM Role for the Kubernetes service account ${var.kubernetes_service_account}."
  assume_role_policy    = data.aws_iam_policy_document.trust_policy.json
  max_session_duration  = 3600
  permissions_boundary  = var.role_permissions_boundary_arn
  force_detach_policies = true
  tags                  = var.tags
}

# IAM ROLE POLICY ATTACHMENTS (external policies, like velero_policy)
resource "aws_iam_role_policy_attachment" "this" {
  for_each   = { for k, v in var.role_policy_arns : k => v }
  role       = aws_iam_role.this.name
  policy_arn = each.value
}

# INLINE PERMISSIONS POLICY
data "aws_iam_policy_document" "permissions_doc" {

  # KMS access
  statement {
    effect = "Allow"
    actions = [
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo"
    ]
    resources = [var.kms_key_arn]
  }

  # EC2 volume and snapshot access
  statement {
    effect = "Allow"
    actions = [
      "ec2:DescribeVolumes",
      "ec2:DescribeSnapshots"
    ]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = ["ec2:CreateVolume"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ebs.csi.aws.com/cluster"
      values   = ["true"]
    }
  }

  statement {
    effect = "Allow"
    actions = ["ec2:CreateSnapshot"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/ebs.csi.aws.com/cluster"
      values   = ["true"]
    }
  }

  statement {
    effect = "Allow"
    actions = ["ec2:CreateSnapshot"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ebs.csi.aws.com/cluster"
      values   = ["true"]
    }
  }

  statement {
    effect = "Allow"
    actions = ["ec2:DeleteSnapshot"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/ebs.csi.aws.com/cluster"
      values   = ["true"]
    }
  }

  statement {
    effect = "Allow"
    actions = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "aws:RequestTag/ebs.csi.aws.com/cluster"
      values   = ["true"]
    }
    condition {
      test     = "ForAllValues:StringEqualsIfExists"
      variable = "ec2:ResourceTag/ebs.csi.aws.com/cluster"
      values   = ["true"]
    }
  }
}

# Inline policy attachment
resource "aws_iam_role_policy" "inline" {
  name   = "${local.irsa_role_name}-inline"
  role   = aws_iam_role.this.name
  policy = data.aws_iam_policy_document.permissions_doc.json
}
