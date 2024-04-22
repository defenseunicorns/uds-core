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
