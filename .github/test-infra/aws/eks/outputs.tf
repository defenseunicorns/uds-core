# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

output "aws_region" {
  value = data.aws_region.current.name
}

output "loki_irsa_role_arn" {
  value = module.irsa["loki"].role_arn
}

output "loki_s3" {
  value = module.S3["loki"]
}

output "loki_s3_bucket" {
  value = module.S3["loki"].bucket_name
}

output "velero_irsa_role_arn" {
  value = module.irsa["velero"].role_arn
}

output "velero_s3" {
  value = module.S3["velero"]
}

output "velero_s3_bucket" {
  value = module.S3["velero"].bucket_name
}

output "grafana_pg_host" {
  description = "RDS Endpoint for Grafana"
  value       = element(split(":", module.db.db_instance_endpoint), 0)
}

output "grafana_pg_port" {
  description = "RDS Port for Grafana"
  value       = var.db_port
}

output "grafana_pg_database" {
  description = "Database name for Grafana"
  value       = var.db_name
}

output "grafana_pg_user" {
  description = "Database username for Grafana"
  value       = var.username
}

output "grafana_pg_password" {
  description = "RDS Password for Grafana"
  value       = random_password.db_password.result
  sensitive   = true
}

output "grafana_ha" {
  value = true
}