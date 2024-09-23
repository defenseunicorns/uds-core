# Prerequisites for EKS cluster that is provisioned later in this workflow via eksctl

module "storage" {
  source       = "../modules/storage"
  cluster_name = var.name
}