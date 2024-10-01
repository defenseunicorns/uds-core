output "aws_region" {
  value = var.region
}

output "private_key" {
  value       = tls_private_key.control_plane_private_key.private_key_pem
  description = "Generated SSH private key that can be used to connect to a cluster node."
  sensitive   = true
}

output "bootstrap_ip" {
  value       = aws_instance.rke2_ci_bootstrap_node.public_ip
  description = "Public IP address of the bootstrap control plane node."
}

output "node_user" {
  value       = var.default_user
  description = "User to use when connecting to a cluster node."
}

output "cluster_hostname" {
  value       = var.cluster_hostname
  description = "Hostname used to connect to cluster."
}

# ZARF_VAR_LOKI_S3_BUCKET
output "loki_s3_bucket" {
  value = module.storage.s3_buckets["loki"].bucket_name
}

#ZARF_VAR_VELERO_S3_BUCKET
output "velero_s3_bucket" {
  value = module.storage.s3_buckets["velero"].bucket_name
}

output "loki_irsa_role_arn" {
  value = module.storage.irsa["loki"].bucket_role.arn
}

output "velero_irsa_role_arn" {
  value = module.storage.irsa["velero"].bucket_role.arn
}
