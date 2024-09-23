output "role_arn" {
  value = {
    for configuration, arn in module.irsa : configuration => arn.role_arn
  }
}