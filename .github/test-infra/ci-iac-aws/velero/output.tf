output "aws_region" {
  value = data.aws_region.current.name
}

output "irsa_role_arn" {
  value = module.irsa.role_arn
}

output "s3" {
  value = module.S3
}

output "s3_bucket" {
  value = module.S3.bucket_name
}

output "kms_key_arn" {
  description = "The ARN of the OIDC Provider of the EKS Cluster"
  value       = local.kms_key_arn
}

output "force_destroy" {
  value = var.force_destroy
}
