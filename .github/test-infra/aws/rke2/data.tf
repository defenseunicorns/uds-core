# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

data "aws_vpc" "vpc" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnet" "rke2_ci_subnet" {
  vpc_id            = data.aws_vpc.vpc.id
  availability_zone = "${var.region}a"

  filter {
    name   = "tag:Name"
    values = [var.subnet_name]
  }
}

data "aws_ami" "rhel_rke2" {
  most_recent = true
  name_regex  = "^uds-rhel-rke2-v${var.rke2_version}"
  owners      = [var.uds_images_aws_account_id]
}

data "aws_subnets" "rds_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.vpc.id]
  }
}

