# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Common data sources
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# Use existing VPC and subnets
data "aws_vpc" "vpc" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnet" "eks_ci_subnet_b" {
  vpc_id            = data.aws_vpc.vpc.id
  availability_zone = "${var.region}b"

  filter {
    name   = "tag:Name"
    values = [var.subnet_name]
  }
}

data "aws_subnet" "eks_ci_subnet_c" {
  vpc_id            = data.aws_vpc.vpc.id
  availability_zone = "${var.region}c"

  filter {
    name   = "tag:Name"
    values = [var.subnet_name]
  }
}
