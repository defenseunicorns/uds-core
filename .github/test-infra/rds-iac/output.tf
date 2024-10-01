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
