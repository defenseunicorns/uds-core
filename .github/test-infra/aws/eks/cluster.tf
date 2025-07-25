# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Custom Launch Template for Node Group
resource "aws_launch_template" "eks_node_group" {
  name_prefix = "${var.name}-lt-"

  # Bottlerocket-specific user data
  user_data = base64encode(<<-EOT
    [settings.kubernetes]
    cluster-name = "${var.name}"
    api-server = "${module.eks.cluster_endpoint}"
    cluster-certificate = "${module.eks.cluster_certificate_authority_data}"
    
    [settings.host-containers.admin]
    enabled = true
    
    [settings.kernel]
    lockdown = "integrity"
    
    [settings.kubernetes.node-labels]
    "eks.amazonaws.com/nodegroup" = "${var.name}"
  EOT
  )
  
  # Add network interface configuration to assign public IPs
  network_interfaces {
    associate_public_ip_address = true
    delete_on_termination       = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.tags, {
      Name = "${var.name}-node"
    })
  }

  lifecycle {
    create_before_destroy = true
  }
}

# EKS Cluster Module
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0.4"

  # Core cluster settings
  name                               = var.name
  kubernetes_version                 = var.kubernetes_version
  endpoint_public_access             = true
  endpoint_private_access            = false
  enabled_log_types                  = []
  cloudwatch_log_group_retention_in_days = 0

  authentication_mode                      = "API_AND_CONFIG_MAP"
  enable_cluster_creator_admin_permissions = true

  # Networking
  vpc_id     = data.aws_vpc.vpc.id
  subnet_ids = local.subnet_ids

  # Cluster security groups
  create_security_group                         = true
  create_node_security_group                    = true
  node_security_group_enable_recommended_rules  = true
  node_security_group_additional_rules = {
    clusterapi_ingress = {
      description                   = "Cluster API Ingress on non-privileged ports"
      protocol                      = "tcp"
      from_port                     = 1025
      to_port                       = 65535
      type                          = "ingress"
      source_cluster_security_group = true
    }
  }

  # IAM boundary & tags
  iam_role_permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}"
  tags                          = local.tags

  # Cluster Addons
  addons = {
    vpc-cni = {
      most_recent           = true
      configuration_values  = jsonencode({ enableNetworkPolicy = "true" })
    }
    aws-ebs-csi-driver = { most_recent = true }
    kube-proxy         = { most_recent = true }
    coredns = {
      most_recent           = true
      configuration_values  = jsonencode({
        corefile = <<-EOT
          .:53 {
              errors
              health { lameduck 5s }
              ready
              kubernetes cluster.local cluster.local in-addr.arpa ip6.arpa {
                  pods insecure
                  fallthrough in-addr.arpa ip6.arpa
                  ttl 30
              }
              prometheus 0.0.0.0:9153
              forward . /etc/resolv.conf
              cache 30
              loop
              reload
              loadbalance
              rewrite stop {
                  name regex (.*\.admin\.uds\.dev) admin-ingressgateway.istio-admin-gateway.svc.cluster.local answer auto
              }
              rewrite stop {
                  name regex (.*\.uds\.dev) tenant-ingressgateway.istio-tenant-gateway.svc.cluster.local answer auto
              }
          }
        EOT
      })
    }
  }

  # Managed Node Group
  eks_managed_node_groups = {
    main = {
      name           = var.name
      instance_types = [var.instance_type]
      ami_type       = "BOTTLEROCKET_x86_64_FIPS"

      min_size     = var.node_group_min_size
      max_size     = var.node_group_max_size
      desired_size = var.node_group_desired_size
      disk_size    = var.node_disk_size

      # Node IAM role setup
      create_iam_role               = true
      iam_role_use_name_prefix      = false
      iam_role_name                 = "${substr(var.name, 0, 30)}-eks-node-role"
      iam_role_permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}"

      # Use our custom launch template with Bottlerocket configuration
      create_launch_template = false
      launch_template_id = aws_launch_template.eks_node_group.id
      launch_template_version = aws_launch_template.eks_node_group.latest_version

      # Attach required AWS managed policies (partition‑qualified)
      iam_role_additional_policies = {
        AmazonEKSWorkerNodePolicy    = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKSWorkerNodePolicy"
        AmazonEKS_CNI_Policy         = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonEKS_CNI_Policy"
        AmazonSSMManagedInstanceCore = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
        AmazonEBSCSIDriverPolicy     = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
      }

      tags = merge(local.tags, {
        PermissionsBoundary = var.permissions_boundary_name
      })
    }
  }
}
