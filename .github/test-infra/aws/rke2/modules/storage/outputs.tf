output "s3_buckets" {
  value = { for k, v in module.s3 : k => v }
}

output "irsa" {
  value = { for k, v in module.irsa : k => v }
}
