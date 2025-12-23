# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# required iam roles for irsa
data "aws_partition" "current" {}

data "aws_iam_policy_document" "ec2_access" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      identifiers = ["ec2.amazonaws.com"]
      type        = "Service"
    }
  }
}

resource "aws_iam_role" "rke2_server" {
  name = "${local.cluster_name}-server"

  assume_role_policy   = data.aws_iam_policy_document.ec2_access.json
  permissions_boundary = local.iam_role_permissions_boundary

  tags = {
    PermissionsBoundary = var.permissions_boundary_name
  }
}

resource "aws_iam_instance_profile" "rke2_server" {
  name = "${local.cluster_name}-server"
  role = aws_iam_role.rke2_server.name
}

# Permissions to get token from S3
data "aws_iam_policy_document" "s3_token" {
  statement {
    effect    = "Allow"
    resources = ["arn:${data.aws_partition.current.partition}:s3:::${local.cluster_name}-*"]
    actions = [
      "s3:GetObject",
      "s3:PutObject"
    ]
  }
}

# Permissions to get OIDC keys from secrets manager
data "aws_iam_policy_document" "oidc_secrets" {
  statement {
    effect = "Allow"
    resources = [
      aws_secretsmanager_secret.public_key.arn,
      aws_secretsmanager_secret.private_key.arn,
    ]
    actions = [
      "secretsmanager:GetSecretValue"
    ]
  }
}

# Cloud controller permissions from upstream - https://github.com/rancherfederal/rke2-aws-tf/blob/d65cb1d0543264f3170d077a2a0527fd95bfd1ae/data.tf#L80
data "aws_iam_policy_document" "aws_ccm" {
  statement {
    effect    = "Allow"
    resources = ["*"]
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeSubnets",
      "ec2:DescribeRouteTables",
      "ec2:DescribeAvailabilityZones",
      "ec2:DescribeSecurityGroups",
      "ec2:CreateSecurityGroup",
      "elasticloadbalancing:DescribeLoadBalancers",
      "ec2:CreateTags",
      "iam:CreateServiceLinkedRole",
      "kms:DescribeKey",
    ]
  }
}

data "local_file" "helm_template" {
  filename = "./scripts/helmchart-template.yaml"
}

data "http" "aws-lb-controller-iam" {
  url = "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.17.0/docs/install/iam_policy_us-gov.json"
}
resource "aws_iam_role_policy" "aws-lb-controller" {
  name = "${local.cluster_name}-lb-controller"
  role = aws_iam_role.rke2_server.id
  policy = data.http.aws-lb-controller-iam.response_body
}

resource "aws_iam_role_policy" "s3_token" {
  name   = "${local.cluster_name}-server-token"
  role   = aws_iam_role.rke2_server.id
  policy = data.aws_iam_policy_document.s3_token.json
}


resource "aws_iam_role_policy" "oidc_secrets" {
  name   = "${local.cluster_name}-server-oidc"
  role   = aws_iam_role.rke2_server.id
  policy = data.aws_iam_policy_document.oidc_secrets.json
}

resource "aws_iam_role_policy" "server_ccm" {
  name   = "${local.cluster_name}-server-ccm"
  role   = aws_iam_role.rke2_server.id
  policy = data.aws_iam_policy_document.aws_ccm.json
}

module "rke2_kms_key" {
  source            = "../modules/kms"
  current_partition = data.aws_partition.current.partition
  account_id        = data.aws_caller_identity.current.account_id

  kms_key_alias_name_prefix         = "rke2-${local.cluster_name}-server"
  kms_key_description               = "RKE2 Key"
  kms_key_policy_default_identities = [aws_iam_role.rke2_server.arn]
}

resource "random_string" "ssm" {
  length  = 4
  special = false
  upper   = false
  numeric = false
}

resource "aws_secretsmanager_secret" "rke2_kms_key_arn" {
  name                    = "rke2/${local.cluster_name}-server/kms-key-arn"
  description             = "Stores the ARN of the KMS key for RKE2 in the ${var.environment} environment"
  recovery_window_in_days = var.recovery_window
}

resource "aws_secretsmanager_secret_version" "rke2_kms_key_arn_value" {
  secret_id     = aws_secretsmanager_secret.rke2_kms_key_arn.id
  secret_string = module.rke2_kms_key.kms_key_arn
}