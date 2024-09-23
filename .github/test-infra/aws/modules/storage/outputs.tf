output "loki_irsa_role_arn" {
  value = module.irsa[0].role_arn["loki"]
}

output "loki_s3" {
  value = module.s3["loki"]
}

output "loki_s3_bucket" {
  value = module.s3["loki"].bucket_name
}

output "velero_irsa_role_arn" {
  value = module.irsa[0].role_arn["velero"]
}

output "velero_s3" {
  value = module.s3["velero"]
}

output "velero_s3_bucket" {
  value = module.s3["velero"].bucket_name
}
