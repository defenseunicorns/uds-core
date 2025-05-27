# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

output "aws_region" {
  value = data.aws_region.current.name
}

output "private_key" {
  value       = tls_private_key.control_plane_private_key.private_key_pem
  description = "Generated SSH private key that can be used to connect to a cluster node."
  sensitive   = true
}

output "bootstrap_ip" {
  sensitive   = true
  value       = aws_instance.rke2_ci_bootstrap_node.public_ip
  description = "Public IP address of the bootstrap control plane node."
}

output "node_user" {
  sensitive   = true
  value       = var.default_user
  description = "User to use when connecting to a cluster node."
}

output "cluster_hostname" {
  sensitive   = true
  value       = var.cluster_hostname
  description = "Hostname used to connect to cluster."
}

output "loki_s3_bucket" {
  sensitive = true
  value     = module.storage.s3_buckets["loki"].bucket_name
}

output "velero_s3_bucket" {
  sensitive = true
  value     = module.storage.s3_buckets["velero"].bucket_name
}

output "loki_irsa_role_arn" {
  sensitive = true
  value     = module.storage.irsa["loki"].bucket_role.arn
}

output "velero_irsa_role_arn" {
  sensitive = true
  value     = module.storage.irsa["velero"].bucket_role.arn
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
