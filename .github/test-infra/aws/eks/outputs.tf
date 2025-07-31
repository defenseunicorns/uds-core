# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

output "aws_region" {
  value = data.aws_region.current.region
}

output "loki_irsa_role_arn" {
  sensitive = true
  value     = module.irsa["loki"].role_arn
}

output "loki_s3" {
  sensitive = true
  value     = module.S3["loki"]
}

output "loki_s3_bucket" {
  sensitive = true
  value     = module.S3["loki"].bucket_name
}

output "velero_irsa_role_arn" {
  sensitive = true
  value     = module.irsa["velero"].role_arn
}

output "velero_s3" {
  sensitive = true
  value     = module.S3["velero"]
}

output "velero_s3_bucket" {
  sensitive = true
  value     = module.S3["velero"].bucket_name
}

output "grafana_pg_host" {
  sensitive   = true
  description = "RDS Endpoint for Grafana"
  value       = element(split(":", module.dbs["grafana"].db_instance_endpoint), 0)
}

output "grafana_pg_database" {
  description = "Database name for Grafana"
  value       = var.databases["grafana"].name
}

output "grafana_pg_user" {
  description = "Database username for Grafana"
  value       = var.databases["grafana"].username
}

output "grafana_pg_password" {
  description = "RDS Password for Grafana"
  value       = random_password.db_passwords["grafana"].result
  sensitive   = true
}

output "keycloak_db_host" {
  sensitive   = true
  description = "RDS Endpoint for Keycloak"
  value       = element(split(":", module.dbs["keycloak"].db_instance_endpoint), 0)
}

output "keycloak_db_database" {
  description = "Database name for Keycloak"
  value       = var.databases["keycloak"].name
}

output "keycloak_db_username" {
  description = "Database username for Keycloak"
  value       = var.databases["keycloak"].username
}

output "keycloak_db_password" {
  description = "RDS Password for Keycloak"
  value       = random_password.db_passwords["keycloak"].result
  sensitive   = true
}
