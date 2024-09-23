# Prerequisites for EKS cluster that is provisioned later in this workflow via eksctl

module "storage" {
  source                    = "../modules/storage"
  cluster_name              = var.name
  use_permissions_boundary  = var.use_permissions_boundary
  permissions_boundary_name = var.permissions_boundary_name
}