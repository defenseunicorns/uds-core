output "region" {
  value = var.region
}

output "loki_irsa_role_arn" {
  value = module.storage.loki_irsa_role_arn
}

output "loki_s3" {
  value = module.storage.loki_s3
}

output "loki_s3_bucket" {
  value = module.storage.loki_s3_bucket
}

output "velero_irsa_role_arn" {
  value = module.storage.velero_irsa_role_arn
}

output "velero_s3" {
  value = module.storage.velero_s3
}

output "velero_s3_bucket" {
  value = module.storage.velero_s3_bucket
}
