# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Common data sources
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}
data "aws_region" "current" {}

# Use existing VPC and subnets or create new ones
data "aws_vpc" "vpc" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

# Find the public route table in the VPC
data "aws_route_table" "public" {
  vpc_id = data.aws_vpc.vpc.id
  filter {
    name   = "tag:Name"
    values = ["*public*"]
  }
}

# Random identifiers
resource "random_id" "default" {
  byte_length = 2
}

resource "random_id" "unique_id" {
  byte_length = 4
}

# Generate a random subnet CIDR that's valid for the VPC
resource "random_integer" "subnet_octet_3" {
  min  = 0
  max  = 250
  seed = var.name
}

resource "random_integer" "subnet_octet_3_second" {
  min  = 0
  max  = 250
  seed = "${var.name}-second"
}
