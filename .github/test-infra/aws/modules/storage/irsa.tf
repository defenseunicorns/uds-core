# IRSA can be used to grant in-cluster applications access to s3, as opposed to access keys
module "irsa" {
  count                     = var.support_irsa ? 1 : 0
  source                    = "./irsa"
  cluster_name              = var.cluster_name
  use_permissions_boundary  = var.use_permissions_boundary
  permissions_boundary_name = var.permissions_boundary_name
  bucket_configurations     = merge(local.bucket_configurations, module.generate_kms)

  depends_on = [
    module.s3
  ]
}