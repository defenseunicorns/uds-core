# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

# Create a new subnet for this cluster
resource "aws_subnet" "cluster_subnet" {
  vpc_id                  = data.aws_vpc.vpc.id
  cidr_block              = local.subnet_cidr
  availability_zone       = "${var.region}b"
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.name}-subnet-1"
  }
}

# Create a second subnet in a different AZ
resource "aws_subnet" "cluster_subnet_second" {
  vpc_id                  = data.aws_vpc.vpc.id
  cidr_block              = local.subnet_cidr_second
  availability_zone       = "${var.region}c" # Different AZ
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.name}-subnet-2"
  }
}

# Associate the public route table with the first subnet
resource "aws_route_table_association" "rta1" {
  subnet_id      = aws_subnet.cluster_subnet.id
  route_table_id = data.aws_route_table.public.id
}

# Associate the public route table with the second subnet
resource "aws_route_table_association" "rta2" {
  subnet_id      = aws_subnet.cluster_subnet_second.id
  route_table_id = data.aws_route_table.public.id
}
