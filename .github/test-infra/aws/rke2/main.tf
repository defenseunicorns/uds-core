# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# sourced from https://github.com/defenseunicorns/uds-rke2-image-builder/tree/2fecc1c9a10180579ada75a9ec92dcb224e82a74/.github/test-infra/rke2-cluster
locals {
  cluster_name = "rke2-nightly-ci-${random_string.ssm.result}"
  tags = {
    cluster_name        = local.cluster_name
    environment         = "ci"
    job_type            = "nightly"
    distribution        = "rke2"
    version             = var.rke2_version
    run_id              = var.run_id
    PermissionsBoundary = var.permissions_boundary_name
  }
  iam_role_permissions_boundary = var.use_permissions_boundary ? "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/${var.permissions_boundary_name}" : null
  userdata = {
    BOOTSTRAP_IP                = ""
    AGENT_NODE                  = false,
    RKE2_JOIN_TOKEN             = random_password.rke2_join_token.result,
    CLUSTER_SANS                = var.cluster_hostname,
    KMS_KEY_ID                  = aws_kms_key.s3_encryption_key.key_id
    secret_prefix               = "${var.environment}-${random_string.ssm.result}"
    BUCKET_REGIONAL_DOMAIN_NAME = module.oidc_bucket.s3_bucket_bucket_regional_domain_name,
    ccm                         = true,
    ccm_external                = true,
    token_bucket                = module.statestore.bucket,
    token_object                = module.statestore.token_object
    cluster_name                = local.tags.cluster_name
    helm_chart_template         = file("./scripts/helmchart-template.yaml")
  }
  
  # Used to get the latest version of aws-load-balancer-controller from renovate into this tf
  aws_load_balancer_controller_template = split("---", data.local_file.helm_template.content)
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#######################################
# Prerequisites
#######################################
# Cluster join token
resource "random_password" "rke2_join_token" {
  length  = 40
  special = false
}

# Control Plane Private Key
resource "tls_private_key" "control_plane_private_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# AWS resource for Control Plane Public Key
resource "aws_key_pair" "control_plane_key_pair" {
  key_name   = "${var.ssh_key_name}-${var.rke2_version}-${random_string.ssm.result}"
  public_key = tls_private_key.control_plane_private_key.public_key_openssh
}

# Encryption key used for all s3 objects
resource "aws_kms_key" "s3_encryption_key" {
  description             = "KMS used to encrypt s3 objects deployed by this project."
  deletion_window_in_days = 7
}

#######################################
# Compute Resources
#######################################
resource "aws_instance" "rke2_ci_bootstrap_node" {
  ami                         = data.aws_ami.rhel_rke2.image_id
  instance_type               = var.control_plane_instance_type
  key_name                    = aws_key_pair.control_plane_key_pair.key_name
  user_data                   = templatefile("${path.module}/scripts/user_data.sh", local.userdata)
  subnet_id                   = data.aws_subnet.rke2_ci_subnet.id
  user_data_replace_on_change = true
  iam_instance_profile        = aws_iam_instance_profile.rke2_server.name

  vpc_security_group_ids      = [aws_security_group.rke2_ci_node_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 100
  }

  tags = merge(local.tags, { "kubernetes.io/cluster/${local.cluster_name}" = "owned" })
}

resource "aws_instance" "rke2_ci_control_plane_node" {
  count = var.control_plane_node_count

  ami                         = data.aws_ami.rhel_rke2.image_id
  instance_type               = var.control_plane_instance_type
  key_name                    = aws_key_pair.control_plane_key_pair.key_name
  user_data                   = templatefile("${path.module}/scripts/user_data.sh", merge(local.userdata, { BOOTSTRAP_IP = aws_instance.rke2_ci_bootstrap_node.private_ip }))
  subnet_id                   = data.aws_subnet.rke2_ci_subnet.id
  user_data_replace_on_change = true
  iam_instance_profile        = aws_iam_instance_profile.rke2_server.name
  vpc_security_group_ids      = [aws_security_group.rke2_ci_node_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 250
  }

  tags = merge(local.tags, { "kubernetes.io/cluster/${local.cluster_name}" = "owned" })
}

resource "aws_instance" "rke2_ci_agent_node" {
  count = var.agent_node_count

  ami                         = data.aws_ami.rhel_rke2.image_id
  instance_type               = var.agent_instance_type
  key_name                    = aws_key_pair.control_plane_key_pair.key_name
  user_data                   = templatefile("${path.module}/scripts/user_data.sh", merge(local.userdata, { BOOTSTRAP_IP = aws_instance.rke2_ci_bootstrap_node.private_ip, AGENT_NODE = true }))
  subnet_id                   = data.aws_subnet.rke2_ci_subnet.id
  user_data_replace_on_change = true
  iam_instance_profile        = aws_iam_instance_profile.rke2_server.name
  vpc_security_group_ids      = [aws_security_group.rke2_ci_node_sg.id]
  associate_public_ip_address = true
  availability_zone           = "${var.region}a"

  root_block_device {
    volume_size = 250
  }

  tags = merge(local.tags, { "kubernetes.io/cluster/${local.cluster_name}" = "owned" })
}

#######################################
# Networking
#######################################
resource "aws_security_group" "rke2_ci_node_sg" {
  name        = "${var.os_distro}-${var.rke2_version}-rke2-ci-sg-${random_string.ssm.result}"
  description = "SG providing settings for RKE2"
  vpc_id      = data.aws_vpc.vpc.id

  ingress {
    description = "All traffic from VPC for testing"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = concat([data.aws_vpc.vpc.cidr_block], var.allowed_in_cidrs)
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}