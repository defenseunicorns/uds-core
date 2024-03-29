output "aws_region" {
  value = data.aws_region.current.name
}

output "loki_irsa_role_arn" {
  value = module.loki_irsa.role_arn
}

output "loki_s3" {
  value = module.loki_S3
}

output "loki_s3_bucket" {
  value = module.loki_S3.bucket_name
}

output "velero_irsa_role_arn" {
  value = module.velero_irsa.role_arn
}

output "velero_s3" {
  value = module.velero_S3
}

output "velero_s3_bucket" {
  value = module.velero_S3.bucket_name
}

output "kms_key_arn" {
  description = "The ARN of the OIDC Provider of the EKS Cluster"
  value       = local.kms_key_arn
}

output "force_destroy" {
  value = var.force_destroy
}
