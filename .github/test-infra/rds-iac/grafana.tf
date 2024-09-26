resource "aws_iam_policy" "grafana_rds_policy" {
  name        = "${var.resource_prefix}${var.environment}-grafana-rds-access"
  path        = "/"
  description = "IAM policy for Grafana to access RDS and Secrets Manager."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Access to Secrets Manager for retrieving database credentials
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:${aws_secretsmanager_secret.db_secret.name}"
      },
      {
        # Optional RDS actions (not required for just database connection)
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBClusters"
        ]
        Resource = "*"
      },
      {
        # Networking permissions if necessary
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
