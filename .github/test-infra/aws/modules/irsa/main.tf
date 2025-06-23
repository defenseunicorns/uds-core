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
