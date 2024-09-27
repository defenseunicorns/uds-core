output "grafana_rds_host" {
  description = "RDS Endpoint for Grafana"
  value       = module.db.db_instance_endpoint
}

output "grafana_rds_name" {
  description = "Database name for Grafana"
  value       = var.db_name
}

output "grafana_rds_user" {
  description = "Database username for Grafana"
  value       = var.username
}

output "grafana_rds_password" {
  description = "RDS Password for Grafana"
  value       = random_password.db_password.result
  sensitive   = true
}
