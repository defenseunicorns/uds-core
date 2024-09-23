# sourced from https://github.com/defenseunicorns/uds-rke2-image-builder/tree/2fecc1c9a10180579ada75a9ec92dcb224e82a74/.github/test-infra/rke2-cluster
locals {
  tags = {
    environment = "ci"
    job_type = "nightly"
    distribution = "rke2"
    version = var.rke2_version
    uds_version = ""
    job_id = ""
    PermissionsBoundary = var.permissions_boundary_name
  }
}

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
  key_name   = "${var.ssh_key_name}-${var.rke2_version}"
  public_key = tls_private_key.control_plane_private_key.public_key_openssh
}

# Encryption key used for all s3 objects
resource "aws_kms_key" "s3_encryption_key" {
  description             = "KMS used to encrypt s3 objects deployed by this project."
  deletion_window_in_days = 7
}

#######################################
# Compute Resources
#################################
resource "aws_instance" "rke2_ci_bootstrap_node" {
  ami                         = var.ami_id
  instance_type               = var.control_plane_instance_type
  key_name                    = aws_key_pair.control_plane_key_pair.key_name
  user_data                   = templatefile("${path.module}/scripts/user_data.sh", { BOOTSTRAP_IP = "", AGENT_NODE = false, RKE2_JOIN_TOKEN = random_password.rke2_join_token.result, CLUSTER_SANS = var.cluster_hostname, KMS_KEY_ID = aws_kms_key.s3_encryption_key.key_id })
  subnet_id                   = data.aws_subnet.rke2_ci_subnet.id
  user_data_replace_on_change = true

  vpc_security_group_ids      = [aws_security_group.rke2_ci_node_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 100
  }

  tags = local.tags 
}

resource "aws_instance" "rke2_ci_control_plane_node" {
  count = var.control_plane_node_count

  ami                         = var.ami_id
  instance_type               = var.control_plane_instance_type
  key_name                    = aws_key_pair.control_plane_key_pair.key_name
  user_data                   = templatefile("${path.module}/scripts/user_data.sh", { BOOTSTRAP_IP = aws_instance.rke2_ci_bootstrap_node.private_ip, AGENT_NODE = false, RKE2_JOIN_TOKEN = random_password.rke2_join_token.result, CLUSTER_SANS = var.cluster_hostname, KMS_KEY_ID = aws_kms_key.s3_encryption_key.key_id })
  subnet_id                   = data.aws_subnet.rke2_ci_subnet.id
  user_data_replace_on_change = true

  vpc_security_group_ids      = [aws_security_group.rke2_ci_node_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 100
  }

  tags = local.tags
}

resource "aws_instance" "rke2_ci_agent_node" {
  count = var.agent_node_count

  ami                         = var.ami_id
  instance_type               = var.agent_instance_type
  key_name                    = aws_key_pair.control_plane_key_pair.key_name
  user_data                   = templatefile("${path.module}/scripts/user_data.sh", { BOOTSTRAP_IP = aws_instance.rke2_ci_bootstrap_node.private_ip, AGENT_NODE = true, RKE2_JOIN_TOKEN = random_password.rke2_join_token.result, CLUSTER_SANS = var.cluster_hostname, KMS_KEY_ID = aws_kms_key.s3_encryption_key.key_id })
  subnet_id                   = data.aws_subnet.rke2_ci_subnet.id
  user_data_replace_on_change = true

  vpc_security_group_ids      = [aws_security_group.rke2_ci_node_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 100
  }

  tags = local.tags
}

#######################################
# Networking
######################################
resource "aws_security_group" "rke2_ci_node_sg" {
  name        = "${var.os_distro}-${var.rke2_version}-rke2-ci-sg"
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