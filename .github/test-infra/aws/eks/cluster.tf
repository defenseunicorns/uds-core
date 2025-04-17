# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial


# Create EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name                   = var.name
  cluster_version                = var.kubernetes_version
  cluster_endpoint_public_access = true

  vpc_id     = data.aws_vpc.vpc.id
  subnet_ids = local.subnet_ids

  # IAM
  iam_role_permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}"

  # Add CloudWatch logging
  cluster_enabled_log_types              = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cloudwatch_log_group_retention_in_days = 1

  # Authentication mode
  authentication_mode = "API_AND_CONFIG_MAP"

  # Enable cluster creator admin permissions
  enable_cluster_creator_admin_permissions = true

  # Security groups
  create_cluster_security_group                = true
  create_node_security_group                   = true
  node_security_group_enable_recommended_rules = true
  node_security_group_additional_rules = {
    clusterapi_ingress = {
      description                   = "Cluster API Ingress on non-privileged  ports"
      protocol                      = "tcp"
      from_port                     = 1025
      to_port                       = 65535
      type                          = "ingress"
      source_cluster_security_group = true
    }
  }

  # Add tags to all resources
  tags = local.tags

  # Node groups
  eks_managed_node_groups = {
    main = {
      name           = var.name
      instance_types = [var.instance_type]
      ami_type       = "BOTTLEROCKET_x86_64_FIPS"

      min_size     = var.node_group_min_size
      max_size     = var.node_group_max_size
      desired_size = var.node_group_desired_size

      disk_size = var.node_disk_size

      # Let the module create the IAM role with permissions boundary
      create_iam_role               = true
      iam_role_use_name_prefix      = false
      iam_role_name                 = "${substr(var.name, 0, 30)}-eks-node-role"
      iam_role_permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}"

      # Add required policies for node functionality
      iam_role_additional_policies = {
        AmazonSSMManagedInstanceCore = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
        AmazonEBSCSIDriverPolicy     = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
      }

      tags = merge(local.tags, {
        PermissionsBoundary = var.permissions_boundary_name
      })
    }
  }

  # EKS Addons
  cluster_addons = {
    vpc-cni = {
      most_recent = true
      configuration_values = jsonencode({
        enableNetworkPolicy = "true"
      })
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    coredns = {
      most_recent = true
    }
  }

  # Explicit dependency on subnet and IAM
  depends_on = [
    aws_subnet.cluster_subnet,
    aws_subnet.cluster_subnet_second,
  ]
}
