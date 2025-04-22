# Copyright 2024 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

resource "random_password" "db_password" {
  length  = 16
  special = false
}

resource "aws_secretsmanager_secret" "db_secret" {
  name                    = "${var.db_name}-db-secret-${random_id.unique_id.hex}"
  description             = "DB authentication token for ${var.db_name}"
  recovery_window_in_days = var.recovery_window
}

resource "aws_secretsmanager_secret_version" "db_secret_value" {
  depends_on    = [aws_secretsmanager_secret.db_secret]
  secret_id     = aws_secretsmanager_secret.db_secret.id
  secret_string = random_password.db_password.result
}

module "db" {
  source  = "terraform-aws-modules/rds/aws"
  version = "6.12.0"

  identifier                     = "${var.db_name}-db"
  instance_use_identifier_prefix = true

  allocated_storage       = var.db_allocated_storage
  backup_retention_period = 1
  backup_window           = "03:00-06:00"
  maintenance_window      = "Mon:00:00-Mon:03:00"
  skip_final_snapshot     = true

  engine               = "postgres"
  engine_version       = var.db_engine_version
  major_engine_version = split(".", var.db_engine_version)[0]
  family               = "postgres15"
  instance_class       = var.db_instance_class

  db_name  = var.db_name
  username = var.username
  port     = var.db_port

  subnet_ids                  = data.aws_subnets.subnets.ids
  create_db_subnet_group      = true
  create_db_parameter_group   = false
  manage_master_user_password = false
  password                    = random_password.db_password.result

  vpc_security_group_ids = [aws_security_group.rds_sg.id]

  depends_on = [
    aws_security_group.rds_sg
  ]
}

resource "aws_security_group" "rds_sg" {
  vpc_id = local.vpc_id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_ingress" {
  security_group_id = aws_security_group.rds_sg.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "tcp"
  from_port   = 0
  to_port     = 5432
}

data "aws_vpc" "vpc" {
  filter {
    name   = "tag:Name"
    values = ["eksctl-${var.name}-cluster/VPC"]
  }
}

data "aws_subnets" "subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.vpc.id]
  }
}

locals {
  vpc_id = data.aws_vpc.vpc.id
}
