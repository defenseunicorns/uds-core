output "aws_region" {
  value = var.region
}

output "loki_s3" {
  value = module.storage.loki_s3
}

output "velero_s3" {
  value = module.storage.velero_s3
}

output "loki_s3_bucket" {
  value = module.storage.s3_buckets["loki"].bucket_name
}

output "velero_s3_bucket" {
  value = module.storage.s3_buckets["velero"].bucket_name
}

output "loki_irsa_role_arn" {
  value = module.storage.irsa["loki"].bucket_role.arn
}

output "velero_irsa_role_arn" {
  value = module.storage.irsa["velero"].bucket_role.arn
}
