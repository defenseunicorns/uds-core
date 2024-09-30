resource "aws_iam_policy" "grafana_pg_policy" {
  name        = "${var.name}-grafana-rds-access-${random_id.unique_id.hex}"
  path        = "/"
  description = "IAM policy for Grafana to access RDS and Secrets Manager."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:${aws_secretsmanager_secret.db_secret.name}"
      },
      {
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBClusters"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups"
        ]
        Resource = "*"
      }
    ]
  })
}

module "grafana_irsa" {
  source = "github.com/defenseunicorns/terraform-aws-uds-irsa?ref=v0.0.3"

  name                          = local.grafana_irsa_config.name
  kubernetes_service_account    = local.grafana_irsa_config.service_account
  kubernetes_namespace          = local.grafana_irsa_config.namespace
  oidc_provider_arn             = local.oidc_arn
  role_permissions_boundary_arn = local.iam_role_permissions_boundary

  role_policy_arns = {
    "grafana" = aws_iam_policy.grafana_pg_policy.arn
  }
}