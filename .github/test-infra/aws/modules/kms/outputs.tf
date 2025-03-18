output "kms_key_arn" {
  value = aws_kms_key.this.arn
}

output "kms_key_alias" {
  value = aws_kms_alias.default.name
}