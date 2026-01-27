# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial


# Create EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.15.0"

  name                    = var.name
  kubernetes_version      = var.kubernetes_version
  endpoint_public_access  = true
  endpoint_private_access = false

  vpc_id     = data.aws_vpc.vpc.id
  subnet_ids = local.subnet_ids

  # IAM
  iam_role_permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}"

  # Add CloudWatch logging
  enabled_log_types                      = []
  cloudwatch_log_group_retention_in_days = 0

  # Authentication mode
  authentication_mode = "API_AND_CONFIG_MAP"

  # Enable cluster creator admin permissions
  enable_cluster_creator_admin_permissions = true

  # Security groups
  create_security_group                        = true
  create_node_security_group                   = true
  node_security_group_enable_recommended_rules = true
  node_security_group_additional_rules = {
    clusterapi_ingress = {
      description                   = "Cluster API Ingress on non-privileged ports"
      protocol                      = "tcp"
      from_port                     = 1025
      to_port                       = 65535
      type                          = "ingress"
      source_cluster_security_group = true
    }

    // This is needed to allow the ELB to communicate with Istio ingress gateways
    ingress_443 = {
      description = "Allow ELB to Nodes"
      protocol    = "tcp"
      from_port   = 443
      to_port     = 443
      type        = "ingress"
      cidr_blocks = [data.aws_vpc.vpc.cidr_block]
    }

    ingress_80 = {
      description = "Allow ELB to Nodes"
      protocol    = "tcp"
      from_port   = 80
      to_port     = 80
      type        = "ingress"
      cidr_blocks = [data.aws_vpc.vpc.cidr_block]
    }

    ingress_node_ports = {
      description = "Allow ELB to Nodes"
      protocol    = "tcp"
      from_port   = 30000
      to_port     = 32767
      type        = "ingress"
      cidr_blocks = [data.aws_vpc.vpc.cidr_block]
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

      metadata_options = {
        http_put_response_hop_limit = 2 // Need 2 hops to not break IRSA from inside pods
        http_tokens                 = "required"
      }

      enable_efa_only            = false
      create_launch_template     = true
      enable_bootstrap_user_data = true
      network_interfaces = [
        {
          // Set launch template to use public IP
          associate_public_ip_address = true
          delete_on_termination       = true
        }
      ]


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
  addons = {
    vpc-cni = {
      most_recent    = true
      before_compute = true
      configuration_values = jsonencode({
        enableNetworkPolicy = "true"
      })
      # Needed because of https://github.com/terraform-aws-modules/terraform-aws-eks/issues/3582
      resolve_conflicts_on_create = "OVERWRITE"
      resolve_conflicts_on_update = "OVERWRITE"
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    coredns = {
      most_recent = true
      configuration_values = jsonencode({
        corefile = <<-EOT
          .:53 {
              errors
              health {
                  lameduck 5s
              }
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
}
